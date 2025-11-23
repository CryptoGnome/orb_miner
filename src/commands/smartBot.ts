import { getWallet, getBalances, getSolBalance } from '../utils/wallet';
import {
  getAutomationPDA,
  getMinerPDA,
  fetchBoard,
  fetchRound,
  fetchMiner,
  fetchStake,
  fetchTreasury
} from '../utils/accounts';
import {
  sendAndConfirmTransaction,
  buildAutomateInstruction,
  buildExecuteAutomationInstruction,
  buildClaimSolInstruction,
  buildClaimOreInstruction,
  buildClaimYieldInstruction,
  buildStakeInstruction,
  AutomationStrategy
} from '../utils/program';
import { getConnection, getCurrentSlot } from '../utils/solana';
import { swapOrbToSol, getOrbPrice } from '../utils/jupiter';
import { loadAndCacheConfig, refreshConfig, config } from '../utils/config';
import { isSetupNeeded } from '../utils/setupWizard';
import { sleep } from '../utils/retry';
import { TransactionInstruction, SystemProgram, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import logger, { ui } from '../utils/logger';
import {
  calculateDeploymentAmount,
  shouldAutoClaim,
  validateDeploymentStrategy,
  getStrategyDescription,
} from '../utils/strategies';
import {
  initializeDatabase,
  closeDatabase,
  recordTransaction,
  recordRound,
  recordBalance,
  recordPrice,
  recordInFlightDeployment,
  cleanupOldInFlightDeployments,
  getBaselineBalance,
  setBaselineBalance,
  recordMotherload,
  getQuery,
} from '../utils/database';
import {
  getCompletePnLSummary,
  formatSol,
  formatOrb,
  formatPercent,
} from '../utils/pnl';
import { loadState, saveState, clearState } from '../utils/state';

/**
 * Smart Autonomous ORB Mining Bot
 *
 * One command that handles everything:
 * - Auto-setup automation account (first run)
 * - Auto-mine (continuous round monitoring + deployment)
 * - Auto-claim (periodic reward checks)
 * - Auto-swap (refund automation when low)
 * - Auto-stake (optional, stake excess ORB)
 *
 * Fully autonomous, threshold-driven operation.
 */

// In-flight deployments now tracked in database (see database.ts)
// This prevents PnL swings from on-chain reward lag (rewards appear 1-2 rounds after deployment)

let isRunning = true;
let signalHandlersRegistered = false;
let lastRewardsCheck = 0;
let lastStakingRewardsCheck = 0;
let lastStakeCheck = 0;
let lastSwapCheck = 0;
let lastBalanceSnapshot = 0;

// Load persisted state on startup
const botState = loadState();
let setupMotherload = botState.setupMotherload; // Track motherload at automation setup time for dynamic scaling
logger.info(`Loaded setupMotherload from state: ${setupMotherload.toFixed(2)} ORB`);

// Setup graceful shutdown
function setupSignalHandlers() {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdownHandler = async () => {
    if (isRunning) {
      logger.info('\nShutdown signal received, stopping gracefully...');
      isRunning = false;
      // Close database connection on shutdown
      try {
        await closeDatabase();
      } catch (error) {
        logger.error('Failed to close database:', error);
      }
    } else {
      logger.info('Force stopping...');
      process.exit(0);
    }
  };

  process.once('SIGINT', shutdownHandler);
  process.once('SIGTERM', shutdownHandler);
}

/**
 * Get the dashboard port from database configuration
 * Returns 3888 as default if not configured
 */
async function getDashboardPort(): Promise<string> {
  try {
    const portRow = await getQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['DASHBOARD_PORT']
    );
    return portRow?.value || '3888';
  } catch (error) {
    // If database query fails, return default
    return '3888';
  }
}

/**
 * Check if mining is profitable based on production cost analysis
 *
 * EV = (Expected ORB × ORB Price in SOL) + Expected SOL Back - Production Cost
 *
 * @param costPerRound SOL deployed per round (production cost)
 * @param motherloadOrb Current motherload in ORB
 * @param currentRound Current round data (to get REAL competition)
 * @returns Object with profitability info
 */
async function isProfitableToMine(
  costPerRound: number,
  motherloadOrb: number,
  currentRound?: any // Round data with totalDeployed
): Promise<{
  profitable: boolean;
  expectedValue: number;
  productionCost: number;
  expectedReturns: number;
  orbPrice: number;
  breakdownMessage: string;
  actualCompetition?: number;
}> {
  try {
    // Get current ORB price in SOL
    const { priceInSol: orbPrice } = await getOrbPrice();

    if (orbPrice === 0) {
      logger.warn('⚠️  Could not fetch ORB price, assuming not profitable');
      return {
        profitable: false,
        expectedValue: 0,
        productionCost: costPerRound,
        expectedReturns: 0,
        orbPrice: 0,
        breakdownMessage: 'ORB price unavailable',
      };
    }

    // Calculate YOUR share of total deployment using REAL on-chain data
    let yourShareOfTotal: number;
    let competitionMultiplier: number;
    let competitionSource: string;

    if (currentRound && currentRound.totalDeployed) {
      // Use REAL competition data from Round account
      const totalDeployedSol = Number(currentRound.totalDeployed) / 1e9;

      // If round just started and totalDeployed is near 0, fall back to estimate
      if (totalDeployedSol < 0.01) {
        competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
        yourShareOfTotal = 1 / (competitionMultiplier + 1);
        competitionSource = `estimate (${competitionMultiplier}x) - round just started`;
      } else {
        // Calculate actual share: your deployment / (total + your deployment)
        yourShareOfTotal = costPerRound / (totalDeployedSol + costPerRound);
        competitionMultiplier = totalDeployedSol / costPerRound;
        competitionSource = `REAL on-chain data (${competitionMultiplier.toFixed(1)}x)`;
      }
    } else {
      // Fall back to config estimate if Round data not available
      competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
      yourShareOfTotal = 1 / (competitionMultiplier + 1);
      competitionSource = `estimate (${competitionMultiplier}x) - Round data unavailable`;
    }

    // Calculate expected ORB rewards based on YOUR actual share
    // Base reward: 4 ORB per round with hybrid distribution:
    //   - 50% of time: split proportionally among winners
    //   - 50% of time: one winner gets all 4 ORB (weighted random)
    // Expected value is the same for both: yourShare × 4
    const baseRewardExpected = yourShareOfTotal * 4;

    // Motherload reward: 1/625 chance to hit, split proportionally
    const motherloadChance = 1 / 625;
    const motherloadExpected = motherloadChance * yourShareOfTotal * motherloadOrb;

    // Total expected ORB (after 10% refining fee)
    const expectedOrbRewards = (baseRewardExpected + motherloadExpected) * 0.9;

    // Expected SOL back (assume 95% of deployment)
    const expectedSolBack = costPerRound * 0.95;

    // Calculate expected value in SOL
    const orbRewardValueInSol = expectedOrbRewards * orbPrice;
    const totalExpectedReturns = orbRewardValueInSol + expectedSolBack;
    const expectedValue = totalExpectedReturns - costPerRound;

    // Mining is profitable if EV > 0 (or above minimum threshold from config)
    const minEV = config.minExpectedValue || 0;
    const profitable = expectedValue >= minEV;

    // Build breakdown message
    const breakdownMessage = [
      `Competition: ${competitionSource}`,
      `Your Share: ${(yourShareOfTotal * 100).toFixed(2)}%`,
      `Production Cost: ${costPerRound.toFixed(6)} SOL`,
      `Expected ORB: ${expectedOrbRewards.toFixed(4)} ORB × ${orbPrice.toFixed(6)} SOL = ${orbRewardValueInSol.toFixed(6)} SOL`,
      `Expected SOL Back: ${expectedSolBack.toFixed(6)} SOL`,
      `Total Expected Returns: ${totalExpectedReturns.toFixed(6)} SOL`,
      `Expected Value (EV): ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`,
      `ROI: ${((expectedValue / costPerRound) * 100).toFixed(2)}%`,
      `Profitable: ${profitable ? '✅ YES' : '❌ NO'}`,
    ].join('\n  ');

    return {
      profitable,
      expectedValue,
      productionCost: costPerRound,
      expectedReturns: totalExpectedReturns,
      orbPrice,
      breakdownMessage,
      actualCompetition: competitionMultiplier,
    };
  } catch (error) {
    logger.error('Failed to calculate profitability:', error);
    return {
      profitable: false,
      expectedValue: 0,
      productionCost: costPerRound,
      expectedReturns: 0,
      orbPrice: 0,
      breakdownMessage: 'Calculation error',
    };
  }
}

/**
 * Check if automation account exists and get its info
 */
async function getAutomationInfo() {
  const connection = getConnection();
  const [automationPDA] = getAutomationPDA(getWallet().publicKey);
  const accountInfo = await connection.getAccountInfo(automationPDA);

  if (!accountInfo || accountInfo.data.length < 112) {
    return null;
  }

  const data = accountInfo.data;
  const amountPerSquare = data.readBigUInt64LE(8);
  const balance = data.readBigUInt64LE(48);
  const mask = data.readBigUInt64LE(104);

  return {
    pda: automationPDA,
    amountPerSquare: Number(amountPerSquare),
    balance: Number(balance),
    mask: Number(mask),
    costPerRound: Number(amountPerSquare) * Number(mask),
  };
}

/**
 * Auto-setup: Create automation account with smart budget allocation
 */
async function autoSetupAutomation(): Promise<boolean> {
  try {
    const wallet = getWallet();
    const solBalance = await getSolBalance();
    ui.status('Wallet Balance', `${solBalance.toFixed(4)} SOL`);

    // Calculate usable budget based on budget type
    let usableBudget: number;
    let budgetDescription: string;

    if (config.budgetType === 'fixed') {
      usableBudget = config.fixedBudgetAmount;
      budgetDescription = `${usableBudget.toFixed(4)} SOL (fixed amount)`;

      // Check if we have enough SOL for the fixed amount
      if (solBalance < usableBudget) {
        ui.error(`Insufficient balance - wallet has ${solBalance.toFixed(4)} SOL but fixed budget is ${usableBudget.toFixed(4)} SOL`);
        return false;
      }
    } else {
      // Default: percentage-based budget
      usableBudget = solBalance * (config.initialAutomationBudgetPct / 100);
      budgetDescription = `${usableBudget.toFixed(4)} SOL (${config.initialAutomationBudgetPct}%)`;
    }

    ui.status('Allocating', budgetDescription);

    if (usableBudget < 0.5) {
      ui.error('Insufficient budget - need at least 0.5 SOL for automation');
      return false;
    }

    // Get current motherload for smart allocation
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;
    ui.status('Current Motherload', `${motherloadOrb.toFixed(2)} ORB`);

    // Calculate deployment amount using selected strategy
    const deploymentCalc = calculateDeploymentAmount({
      strategy: config.deploymentAmountStrategy,
      usableBudget,
      motherloadOrb,
      manualAmountPerRound: config.manualAmountPerRound,
      targetRounds: config.targetRounds,
      budgetPercentagePerRound: config.budgetPercentagePerRound,
    });

    // Validate strategy configuration
    const validation = validateDeploymentStrategy({
      strategy: config.deploymentAmountStrategy,
      usableBudget,
      motherloadOrb,
      manualAmountPerRound: config.manualAmountPerRound,
      targetRounds: config.targetRounds,
      budgetPercentagePerRound: config.budgetPercentagePerRound,
    });

    if (!validation.valid) {
      ui.error(`Invalid strategy configuration: ${validation.error}`);
      return false;
    }

    const { solPerSquare } = deploymentCalc;

    ui.status('Strategy', getStrategyDescription(deploymentCalc));

    if (config.dryRun) {
      logger.info('[DRY RUN] Would create automation account');
      return true;
    }

    // Create automation account
    const deposit = usableBudget;
    const feePerExecution = 0.00001;
    const strategy = AutomationStrategy.Random;
    const squareMask = 25n;

    const instruction = buildAutomateInstruction(
      solPerSquare,
      deposit,
      feePerExecution,
      strategy,
      squareMask,
      wallet.publicKey
    );

    ui.info('Creating automation account...');
    const { signature, fee: actualFee } = await sendAndConfirmTransaction([instruction], 'Setup Automation');
    ui.success('Automation account created!');
    logger.debug(`Transaction: ${signature}`);

    // Track setup motherload for dynamic scaling
    setupMotherload = motherloadOrb;
    logger.debug(`Tracking setup motherload: ${setupMotherload.toFixed(2)} ORB`);

    // Persist state to survive bot restarts
    const board = await fetchBoard();
    saveState({
      setupMotherload: motherloadOrb,
      setupTimestamp: Date.now(),
      setupRoundId: board.roundId.toNumber(),
      notes: `Setup: ${deploymentCalc.notes}`,
    });
    logger.debug('Persisted automation setup state to disk');

    // Record automation setup in database
    try {
      const { priceInUsd: orbPriceUsd } = await getOrbPrice();

      await recordTransaction({
        type: 'automation_setup',
        signature,
        solAmount: deposit,
        status: 'success',
        notes: `Setup: ${deploymentCalc.notes} (motherload: ${motherloadOrb.toFixed(2)} ORB)`,
        orbPriceUsd,
        txFeeSol: actualFee,
      });
    } catch (error) {
      logger.error('Failed to record automation setup:', error);
    }

    return true;
  } catch (error) {
    logger.error('Auto-setup failed:', error);
    return false;
  }
}


/**
 * Display unified PnL summary (live bot display)
 *
 * Shows current profit/loss using the unified PnL system.
 * Wallet balance as source of truth: Starting Balance → Current Balance = Profit
 *
 * @param automationBalance - Current automation account balance in SOL
 * @param claimableSol - Pending claimable SOL rewards
 * @param claimableOrb - Pending claimable ORB rewards
 * @param walletOrb - Current wallet ORB balance
 * @param stakedOrb - Currently staked ORB balance
 *
 * Uses unified PnL module (src/utils/pnl.ts) for consistent calculations.
 * In-flight deployments tracked in database for accuracy.
 */
async function displayQuickPnL(
  automationBalance: number,
  claimableSol: number,
  claimableOrb: number,
  walletOrb: number,
  stakedOrb: number
): Promise<void> {
  try {
    // Get wallet balance for unified PnL
    const balances = await getBalances();

    // Get ORB price
    const { priceInUsd: orbPriceUsd, priceInSol: orbPriceSol } = await getOrbPrice();
    const solPriceUsd = orbPriceUsd / orbPriceSol; // Derive SOL price from ORB price

    // Get complete PnL summary using unified system
    const pnl = await getCompletePnLSummary(
      balances.sol,
      automationBalance,
      claimableSol,
      walletOrb,
      claimableOrb,
      stakedOrb,
      orbPriceSol,
      solPriceUsd
    );

    // Display unified PnL
    logger.info('═══════════════════════════════════════════════');
    logger.info('                 📊 PROFIT & LOSS              ');
    logger.info('═══════════════════════════════════════════════');

    // Main PnL (wallet balance as source of truth)
    const pnlEmoji = pnl.summary.isProfitable ? '✅' : '❌';
    const profitSign = pnl.summary.netProfit >= 0 ? '+' : '';
    logger.info(`💰 Net Profit: ${pnlEmoji} ${profitSign}${formatSol(pnl.summary.netProfit)} SOL (${formatPercent(pnl.summary.roi)})`);
    logger.info(`   Starting: ${formatSol(pnl.truePnL.startingBalance)} SOL → Current: ${formatSol(pnl.truePnL.currentBalance)} SOL`);

    if (!pnl.truePnL.hasBaseline) {
      logger.info(`   ⚠️  No baseline set - profit calculated from earliest snapshot`);
    }

    // Current Holdings
    logger.info('');
    logger.info('📈 Current Holdings:');
    logger.info(`   SOL: ${formatSol(pnl.truePnL.holdings.totalSol)} (wallet: ${formatSol(balances.sol)}, automation: ${formatSol(automationBalance)}, claimable: ${formatSol(claimableSol)})`);
    logger.info(`   ORB: ${formatOrb(pnl.truePnL.holdings.totalOrb)} = ${formatSol(pnl.truePnL.holdings.orbValueSol)} SOL @ $${orbPriceUsd.toFixed(2)}/ORB`);

    // Income & Expenses Breakdown
    logger.info('');
    logger.info('💵 Income:');
    logger.info(`   Mining: ${formatSol(pnl.breakdown.income.solFromMining)} SOL + ${formatOrb(pnl.breakdown.income.orbFromMining)} ORB`);
    if (pnl.breakdown.income.solFromSwaps > 0) {
      logger.info(`   Swaps: ${formatSol(pnl.breakdown.income.solFromSwaps)} SOL (sold ${formatOrb(pnl.breakdown.income.orbSwappedCount)} ORB)`);
    }
    logger.info(`   Total: ${formatSol(pnl.breakdown.income.totalSolIncome)} SOL`);

    logger.info('');
    logger.info('💸 Expenses:');
    logger.info(`   Transaction Fees: ${formatSol(pnl.breakdown.expenses.transactionFees)} SOL`);
    logger.info(`   Protocol Fees: ${formatSol(pnl.breakdown.expenses.protocolFees)} SOL (10% deploy fee)`);
    logger.info(`   Dev Fees: ${formatSol(pnl.breakdown.expenses.devFees)} SOL (0.5%)`);
    logger.info(`   Total Fees: ${formatSol(pnl.breakdown.expenses.totalExpenses)} SOL`);
    logger.info(`   Capital Deployed: ${formatSol(pnl.breakdown.expenses.deployedSol)} SOL (in automation account)`);

    // Stats
    logger.info('');
    logger.info(`📊 Activity: ${pnl.breakdown.stats.roundsParticipated} rounds, ${pnl.breakdown.stats.totalDeployments} deployments, ${pnl.breakdown.stats.totalClaims} claims`);

    logger.info('═══════════════════════════════════════════════');
  } catch (error) {
    logger.debug('Failed to display unified PnL:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Capture periodic balance snapshots for PnL tracking
 */
async function captureBalanceSnapshot(): Promise<void> {
  try {
    const now = Date.now();
    // Capture every 5 minutes
    if (now - lastBalanceSnapshot < 300000) {
      return;
    }
    lastBalanceSnapshot = now;

    const wallet = getWallet();
    const balances = await getBalances();
    const miner = await fetchMiner(wallet.publicKey);
    const stake = await fetchStake(wallet.publicKey);
    const automationInfo = await getAutomationInfo();

    // Get ORB price for snapshot
    const { priceInUsd: orbPriceUsd, priceInSol: orbPriceSol } = await getOrbPrice();

    await recordBalance(
      balances.sol,
      balances.orb,
      automationInfo ? automationInfo.balance / 1e9 : 0,
      miner ? Number(miner.rewardsSol) / 1e9 : 0,
      miner ? Number(miner.rewardsOre) / 1e9 : 0,
      stake ? Number(stake.balance) / 1e9 : 0,
      orbPriceUsd // Include ORB price in balance snapshot
    );

    // Also record in prices table
    if (orbPriceUsd > 0 && orbPriceSol > 0) {
      await recordPrice(orbPriceUsd, orbPriceSol);
    }

    logger.debug('Captured balance snapshot with ORB price');
  } catch (error) {
    logger.error('Failed to capture balance snapshot:', error);
  }
}

/**
 * Auto-claim mining rewards: Check and claim mining rewards when thresholds are met
 */
async function autoClaimMiningRewards(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastRewardsCheck < config.checkRewardsIntervalMs) {
      return;
    }
    lastRewardsCheck = now;

    logger.debug('Checking mining rewards for auto-claim...');
    const wallet = getWallet();
    const instructions: TransactionInstruction[] = [];

    // Check if checkpoint is needed before claiming
    const { fetchBoard } = await import('../utils/accounts');
    const board = await fetchBoard();
    const miner = await fetchMiner(wallet.publicKey);

    if (!miner) {
      logger.debug('No miner account found');
      return;
    }

    // Checkpoint if needed (rewards must be checkpointed before they can be claimed)
    if (miner.checkpointId.lt(board.roundId)) {
      const roundsBehind = board.roundId.sub(miner.checkpointId).toNumber();
      logger.debug(`Checkpointing ${roundsBehind} round(s) before claiming...`);

      try {
        const { buildCheckpointInstruction } = await import('../utils/program');
        const checkpointIx = await buildCheckpointInstruction();
        const { signature: checkpointSig } = await sendAndConfirmTransaction([checkpointIx], 'Checkpoint');
        logger.debug(`Checkpointed: ${checkpointSig}`);

        // Wait a moment for state to update
        await sleep(1000);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        if (!errorMsg.includes('AlreadyProcessed')) {
          logger.error(`Failed to checkpoint before claim: ${errorMsg}`);
          return;
        }
        logger.debug('Rounds already checkpointed');
      }
    }

    // Re-fetch miner after checkpointing to get updated claimable amounts
    const updatedMiner = await fetchMiner(wallet.publicKey);
    if (!updatedMiner) {
      logger.debug('No miner account found after checkpoint');
      return;
    }

    const miningSolBefore = Number(updatedMiner.rewardsSol) / 1e9;
    const miningOrbBefore = Number(updatedMiner.rewardsOre) / 1e9;

    // Check if should auto-claim based on strategy
    const shouldClaim = shouldAutoClaim(
      {
        strategy: config.claimStrategy,
        autoClaimSolThreshold: config.autoClaimSolThreshold,
        autoClaimOrbThreshold: config.autoClaimOrbThreshold,
      },
      miningSolBefore,
      miningOrbBefore,
      false // not staking rewards
    );

    if (!shouldClaim) {
      logger.debug(`Claim strategy ${config.claimStrategy}: not claiming yet`);
      return;
    }

    // Auto-claim SOL
    if (miningSolBefore >= config.autoClaimSolThreshold) {
      ui.claim(`Claiming ${miningSolBefore.toFixed(4)} SOL (mining rewards)`);
      instructions.push(buildClaimSolInstruction());
    }

    // Auto-claim ORB from mining
    if (miningOrbBefore >= config.autoClaimOrbThreshold) {
      ui.claim(`Claiming ${miningOrbBefore.toFixed(2)} ORB (mining rewards)`);
      instructions.push(await buildClaimOreInstruction());
    }

    // Send mining claims (if any)
    if (instructions.length > 0 && !config.dryRun) {
      const { signature, fee: actualFee } = await sendAndConfirmTransaction(instructions, 'Auto-Claim Mining');
      ui.success(`Claimed mining rewards`);
      logger.debug(`Transaction: ${signature}`);

      // Get actual amounts claimed by comparing before/after
      try {
        // Wait for state to update
        await sleep(1000);

        const minerAfter = await fetchMiner(wallet.publicKey);
        if (minerAfter) {
          const miningSolAfter = Number(minerAfter.rewardsSol) / 1e9;
          const miningOrbAfter = Number(minerAfter.rewardsOre) / 1e9;

          // Calculate actual amounts claimed (difference)
          const actualSolClaimed = miningSolBefore - miningSolAfter;
          const actualOrbClaimed = miningOrbBefore - miningOrbAfter;

          logger.debug(`Actual claimed: ${actualSolClaimed.toFixed(4)} SOL, ${actualOrbClaimed.toFixed(4)} ORB`);

          // Get ORB price for transaction record
          const { priceInUsd: orbPriceUsd } = await getOrbPrice();

          // Record only if actually claimed (> 0)
          // Split the fee proportionally between SOL and ORB claims if both exist
          const bothClaimed = (actualSolClaimed > 0.0001) && (actualOrbClaimed > 0.0001);
          const solFee = bothClaimed ? actualFee / 2 : actualFee;
          const orbFee = bothClaimed ? actualFee / 2 : actualFee;

          if (actualSolClaimed > 0.0001) {
            await recordTransaction({
              type: 'claim_sol',
              signature,
              solAmount: actualSolClaimed,
              status: 'success',
              notes: 'Mining rewards',
              orbPriceUsd,
              txFeeSol: solFee,
            });
          }

          if (actualOrbClaimed > 0.0001) {
            await recordTransaction({
              type: 'claim_orb',
              signature,
              orbAmount: actualOrbClaimed,
              status: 'success',
              notes: 'Mining rewards',
              orbPriceUsd,
              txFeeSol: orbFee,
            });
          }
        }
      } catch (error) {
        logger.error('Failed to record claim:', error);
      }

      // Cleanup old in-flight deployments (rewards have now appeared on-chain)
      await cleanupOldInFlightDeployments();
    }
  } catch (error) {
    logger.error('Auto-claim mining rewards failed:', error);
  }
}

/**
 * Auto-claim staking rewards: Check and claim staking rewards when thresholds are met
 *
 * Uses Treasury stake rewards factor to calculate accrued rewards for more accurate detection.
 */
async function autoClaimStakingRewards(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastStakingRewardsCheck < config.checkStakingRewardsIntervalMs) {
      return;
    }
    lastStakingRewardsCheck = now;

    logger.debug('Checking staking rewards for auto-claim...');
    const wallet = getWallet();

    // Check staking rewards
    const stakeBefore = await fetchStake(wallet.publicKey);
    if (stakeBefore) {
      const stakedAmount = Number(stakeBefore.balance) / 1e9;

      // Get REALIZED claimable rewards from Stake account
      const realizedOrbRewards = Number(stakeBefore.rewardsOre) / 1e9;

      // Get ACCRUED rewards using Treasury factor (more accurate)
      let accruedOrbRewards = 0;
      try {
        const treasury = await fetchTreasury();
        const { calculateAccruedStakingRewards } = await import('../utils/accounts');

        const accruedLamports = calculateAccruedStakingRewards(
          treasury.stakeRewardsFactor,
          stakeBefore.rewardsFactor,
          stakeBefore.balance
        );
        accruedOrbRewards = Number(accruedLamports) / 1e9;

        logger.debug(`Staking rewards - Realized: ${realizedOrbRewards.toFixed(4)} ORB, Accrued: ${accruedOrbRewards.toFixed(4)} ORB`);
      } catch (error) {
        logger.debug('Could not calculate accrued staking rewards, using realized amount only');
        accruedOrbRewards = realizedOrbRewards;
      }

      // Use the higher of realized or accrued rewards for claiming
      const claimableOrbRewards = Math.max(realizedOrbRewards, accruedOrbRewards);

      // Check if should auto-claim based on strategy
      const shouldClaim = shouldAutoClaim(
        {
          strategy: config.claimStrategy,
          autoClaimStakingOrbThreshold: config.autoClaimStakingOrbThreshold,
        },
        0, // no SOL from staking
        claimableOrbRewards,
        true // staking rewards
      );

      if (!shouldClaim) {
        logger.debug(`Claim strategy ${config.claimStrategy}: not claiming staking rewards yet`);
        return;
      }

      if (stakedAmount > 0 && claimableOrbRewards >= config.autoClaimStakingOrbThreshold && !config.dryRun) {
        logger.debug(`Staking: ${stakedAmount.toFixed(2)} ORB staked, ${claimableOrbRewards.toFixed(4)} ORB claimable (realized: ${realizedOrbRewards.toFixed(4)}, accrued: ${accruedOrbRewards.toFixed(4)})`);

        try {
          const claimInstruction = await buildClaimYieldInstruction(config.autoClaimStakingOrbThreshold);
          const { signature, fee: actualFee } = await sendAndConfirmTransaction([claimInstruction], 'Auto-Claim Staking');
          ui.success(`Claimed staking rewards`);
          logger.debug(`Transaction: ${signature}`);

          // Get actual amount claimed by comparing before/after
          try {
            // Wait for state to update
            await sleep(1000);

            const stakeAfter = await fetchStake(wallet.publicKey);
            if (stakeAfter) {
              const stakingOrbAfter = Number(stakeAfter.rewardsOre) / 1e9;
              const actualOrbClaimed = realizedOrbRewards - stakingOrbAfter;

              logger.debug(`Actual staking rewards claimed: ${actualOrbClaimed.toFixed(4)} ORB`);

              // Record only if actually claimed (> 0)
              if (actualOrbClaimed > 0.0001) {
                await recordTransaction({
                  type: 'claim_orb',
                  signature,
                  orbAmount: actualOrbClaimed,
                  status: 'success',
                  notes: 'Staking rewards',
                  txFeeSol: actualFee,
                });
              }
            }
          } catch (error) {
            logger.error('Failed to record staking claim:', error);
          }
        } catch (error: any) {
          logger.debug(`Staking claim not ready (insufficient rewards from buybacks): ${error.message || error}`);
        }
      }
    } else {
      logger.debug('No stake account found (not staking)');
    }
  } catch (error) {
    logger.error('Auto-claim staking rewards failed:', error);
  }
}

/**
 * Build instruction to close automation account
 * Returns the automation balance that will be returned on close
 */
async function getAutomationBalanceForClose(): Promise<number> {
  const info = await getAutomationInfo();
  return info ? info.balance / 1e9 : 0;
}

/**
 * Build instruction to close automation account
 */
function buildCloseAutomationInstruction(): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);

  // Build automate instruction with executor = Pubkey::default() to signal closure
  const AUTOMATE_DISCRIMINATOR = 0x00;
  const data = Buffer.alloc(34);
  data.writeUInt8(AUTOMATE_DISCRIMINATOR, 0);
  // Rest is all zeros to signal closure

  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: automationPDA, isSigner: false, isWritable: true },
    { pubkey: PublicKey.default, isSigner: false, isWritable: true }, // default pubkey signals close
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

/**
 * Check if automation should be restarted based on motherload changes
 * Returns true if restart is recommended
 */
async function shouldRestartAutomation(currentMotherload: number): Promise<boolean> {
  // No restart if we don't have a tracked setup motherload yet
  if (setupMotherload === 0) {
    return false;
  }

  // Calculate percent change from setup motherload
  const percentChange = ((currentMotherload - setupMotherload) / setupMotherload) * 100;
  const absoluteChange = Math.abs(currentMotherload - setupMotherload);

  // Restart conditions:
  // 1. Motherload increased by 50%+ AND at least 100 ORB increase
  //    Example: 300 → 450+ (or 200 → 300+)
  // 2. Motherload decreased by 40%+ AND at least 100 ORB decrease
  //    Example: 500 → 300- (need to reduce deployment amounts)
  const shouldIncrease = percentChange >= 50 && absoluteChange >= 100;
  const shouldDecrease = percentChange <= -40 && absoluteChange >= 100;

  if (shouldIncrease) {
    ui.blank();
    ui.info(`🚀 Motherload increased: ${setupMotherload.toFixed(0)} → ${currentMotherload.toFixed(0)} ORB (+${percentChange.toFixed(0)}%)`);
    ui.info('Restarting with larger deployment amounts...');
    return true;
  }

  if (shouldDecrease) {
    ui.blank();
    ui.warning(`📉 Motherload decreased: ${setupMotherload.toFixed(0)} → ${currentMotherload.toFixed(0)} ORB (${percentChange.toFixed(0)}%)`);
    ui.info('Restarting with smaller deployment amounts...');
    return true;
  }

  return false;
}

/**
 * Close current automation and restart with new amounts based on current motherload
 */
async function restartAutomationForScaling(): Promise<boolean> {
  try {
    ui.info('Closing current automation...');

    // Get balance BEFORE closing to record capital return
    const returnedSol = await getAutomationBalanceForClose();

    const closeInstruction = buildCloseAutomationInstruction();
    const { signature: closeSig, fee: actualFee } = await sendAndConfirmTransaction([closeInstruction], 'Close Automation for Scaling');
    logger.debug(`Automation closed: ${closeSig}`);

    // Record automation close with returned SOL amount
    try {
      const { priceInUsd: orbPriceUsd } = await getOrbPrice();

      await recordTransaction({
        type: 'automation_close',
        signature: closeSig,
        solAmount: returnedSol,
        status: 'success',
        notes: `Closed for dynamic scaling - returned ${returnedSol.toFixed(4)} SOL to wallet`,
        orbPriceUsd,
        txFeeSol: actualFee,
      });
    } catch (error) {
      logger.error('Failed to record automation close:', error);
    }

    // Clear persisted state since automation is closed
    clearState();
    setupMotherload = 0;
    logger.debug('Cleared automation state - will be reset on next setup');

    // Wait for closure to propagate
    await sleep(2000);

    // Recreate with current motherload (autoSetupAutomation fetches it automatically)
    ui.info('Recreating with optimized amounts...');
    const setupSuccess = await autoSetupAutomation();

    if (setupSuccess) {
      ui.success('Automation restarted successfully!');
      return true;
    } else {
      ui.error('Failed to recreate automation');
      return false;
    }
  } catch (error) {
    logger.error('Failed to restart automation:', error);
    return false;
  }
}

/**
 * Auto-swap: Proactively sell ORB when wallet balance is high
 * SOL stays in wallet and funds future automation restarts
 */
async function autoSellOrb(): Promise<void> {
  try {
    // Check if wallet ORB balance is high enough to sell
    const balances = await getBalances();
    if (balances.orb < config.walletOrbSwapThreshold) {
      return; // Not enough ORB to trigger swap
    }

    if (!config.autoSwapEnabled) {
      logger.debug('Auto-swap disabled - skipping ORB sale');
      return;
    }

    // Calculate how much ORB to swap
    const orbToSwap = Math.max(0, balances.orb - config.minOrbToKeep);

    if (orbToSwap < config.minOrbSwapAmount) {
      logger.debug(`Not enough ORB to swap (have ${balances.orb.toFixed(2)}, need ${config.minOrbSwapAmount} after keeping ${config.minOrbToKeep})`);
      return;
    }

    // Check if ORB price meets minimum threshold
    if (config.minOrbPriceUsd > 0) {
      const { priceInUsd } = await getOrbPrice();

      if (priceInUsd === 0) {
        ui.warning('Cannot fetch ORB price - skipping swap for safety');
        return;
      }

      if (priceInUsd < config.minOrbPriceUsd) {
        ui.warning(`ORB price too low: $${priceInUsd.toFixed(2)} (min: $${config.minOrbPriceUsd.toFixed(2)})`);
        return;
      }

      logger.debug(`ORB price: $${priceInUsd.toFixed(2)}`);
    }

    // All checks passed - proceed with swap
    ui.swap(`Swapping ${orbToSwap.toFixed(2)} ORB to SOL...`);

    const result = await swapOrbToSol(orbToSwap, config.slippageBps);

    if (result.success && result.solReceived) {
      ui.success(`Received ${result.solReceived.toFixed(4)} SOL (kept in wallet for future restarts)`);

      // Record swap transaction
      try {
        // Get ORB price at time of swap
        const { priceInUsd: orbPriceUsd } = await getOrbPrice();

        await recordTransaction({
          type: 'swap',
          signature: result.signature,
          orbAmount: orbToSwap,
          solAmount: result.solReceived,
          status: 'success',
          notes: `Swapped ORB to SOL (proactive selling)`,
          orbPriceUsd,
          txFeeSol: 0.001, // Estimated swap transaction fee
        });
      } catch (error) {
        logger.error('Failed to record swap:', error);
      }
    } else {
      logger.error('❌ Auto-swap failed');

      // Record failed swap
      try {
        const { priceInUsd: orbPriceUsd } = await getOrbPrice();

        await recordTransaction({
          type: 'swap',
          orbAmount: orbToSwap,
          status: 'failed',
          notes: 'Swap failed - check logs for details',
          orbPriceUsd,
        });
      } catch (error) {
        logger.error('Failed to record failed swap:', error);
      }
    }
  } catch (error) {
    logger.error('Auto-sell ORB failed:', error);
  }
}

/**
 * Auto-swap wrapper: Periodically check and sell ORB
 */
async function autoSwapCheck(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastSwapCheck < config.checkRewardsIntervalMs) {
      return;
    }
    lastSwapCheck = now;

    logger.debug('Checking wallet ORB balance for auto-swap...');
    await autoSellOrb();
  } catch (error) {
    logger.error('Auto-swap check failed:', error);
  }
}

/**
 * Auto-stake: Stake excess ORB when threshold is met
 */
async function autoStakeOrb(): Promise<void> {
  try {
    if (!config.autoStakeEnabled) {
      return;
    }

    const now = Date.now();
    if (now - lastStakeCheck < config.checkRewardsIntervalMs * 2) {
      return; // Check less frequently than claims
    }
    lastStakeCheck = now;

    const balances = await getBalances();
    const orbAvailable = balances.orb - config.minOrbToKeep;

    if (orbAvailable >= config.stakeOrbThreshold) {
      ui.stake(`Staking ${orbAvailable.toFixed(2)} ORB...`);

      const stakeAmount = orbAvailable;

      if (config.dryRun) {
        logger.info(`[DRY RUN] Would stake ${stakeAmount.toFixed(2)} ORB`);
        return;
      }

      const instruction = buildStakeInstruction(stakeAmount);
      const { signature, fee: actualFee } = await sendAndConfirmTransaction([instruction], 'Auto-Stake');
      ui.success(`Staked ${stakeAmount.toFixed(2)} ORB`);
      logger.debug(`Transaction: ${signature}`);

      // Record stake transaction
      try {
        await recordTransaction({
          type: 'stake',
          signature,
          orbAmount: stakeAmount,
          status: 'success',
          notes: 'Auto-staked excess ORB',
          txFeeSol: actualFee,
        });
      } catch (error) {
        logger.error('Failed to record stake:', error);
      }
    }
  } catch (error) {
    logger.error('Auto-stake failed:', error);
  }
}

/**
 * Auto-mine: Execute deployment for current round using automation account
 */
async function autoMineRound(automationInfo: any): Promise<boolean> {
  try {
    // Check if we have enough balance for this round
    if (automationInfo.balance < automationInfo.costPerRound) {
      logger.debug(`Budget depleted: Need ${(automationInfo.costPerRound / 1e9).toFixed(4)} SOL, Have ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);
      return false; // Signal that automation needs to be recreated (will be handled in main loop)
    }

    // Get current board state
    const board = await fetchBoard();
    const currentSlot = await getCurrentSlot();

    // Check motherload threshold FIRST - no point checkpointing if we're not going to mine
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;

    if (motherloadOrb < config.motherloadThreshold) {
      ui.info(`⏸️  Motherload (${motherloadOrb.toFixed(2)} ORB) below threshold (${config.motherloadThreshold} ORB) - waiting...`);
      logger.debug(`Motherload below threshold, skipping deployment`);
      return false;
    }

    // Check if miner needs checkpointing BEFORE attempting deployment
    // (Only checkpoint if we're actually going to mine - saves tx fees)
    const wallet = getWallet();
    const miner = await fetchMiner(wallet.publicKey);

    logger.debug(`Checking miner checkpoint status...`);
    logger.debug(`Miner exists: ${!!miner}`);
    if (miner) {
      logger.debug(`Miner checkpointId: ${miner.checkpointId.toString()}, Board roundId: ${board.roundId.toString()}`);
      logger.debug(`Miner behind? ${miner.checkpointId.lt(board.roundId)}`);
    }

    if (miner && miner.checkpointId.lt(board.roundId)) {
      const roundsBehind = board.roundId.sub(miner.checkpointId).toNumber();
      ui.info(`Checkpointing ${roundsBehind} previous round(s)...`);

      // Single checkpoint instruction handles all pending rounds
      const { buildCheckpointInstruction } = await import('../utils/program');

      try {
        const checkpointIx = await buildCheckpointInstruction();
        const { signature: checkpointSig } = await sendAndConfirmTransaction([checkpointIx], 'Checkpoint');
        logger.debug(`Checkpoint transaction: ${checkpointSig}`);
        ui.success(`Checkpointed ${roundsBehind} round(s)`);
      } catch (error: any) {
        const errorMsg = String(error.message || error);

        // "AlreadyProcessed" is not a fatal error - just means rounds already checkpointed
        if (errorMsg.includes('AlreadyProcessed')) {
          logger.debug(`Rounds already checkpointed, continuing...`);
          ui.success(`Rounds already checkpointed`);
        } else {
          // Other errors are fatal
          logger.error(`Failed to checkpoint: ${errorMsg}`);
          return false;
        }
      }

      // Re-fetch BOTH board and miner after checkpointing to get updated state
      const updatedBoard = await fetchBoard();
      const updatedMiner = await fetchMiner(wallet.publicKey);

      logger.debug(`Board round after checkpointing: ${updatedBoard.roundId.toString()}`);
      if (updatedMiner) {
        logger.debug(`Miner checkpointId after checkpointing: ${updatedMiner.checkpointId.toString()}`);
        logger.debug(`Rounds still behind: ${updatedBoard.roundId.sub(updatedMiner.checkpointId).toString()}`);

        // Log to debug only - checkpoint is working, just deserialization offset issue
        if (updatedMiner.checkpointId.lt(updatedBoard.roundId)) {
          const stillBehind = updatedBoard.roundId.sub(updatedMiner.checkpointId).toNumber();
          if (stillBehind > 10) {
            logger.debug(`checkpointId offset may be incorrect (shows ${stillBehind} rounds behind, but checkpoint succeeded)`);
          }
        }
      }

      // Update board reference for deployment
      Object.assign(board, updatedBoard);
    }

    // Production Cost Profitability Check
    if (config.enableProductionCostCheck) {
      const costPerRound = automationInfo.costPerRound / 1e9;

      // Fetch current round to get REAL competition data
      let currentRound;
      try {
        currentRound = await fetchRound(board.roundId);
        logger.debug(`Round ${board.roundId.toString()}: totalDeployed = ${(Number(currentRound.totalDeployed) / 1e9).toFixed(4)} SOL`);
      } catch (error) {
        logger.debug('Could not fetch round data, using estimated competition');
        currentRound = null;
      }

      const profitability = await isProfitableToMine(costPerRound, motherloadOrb, currentRound);

      if (!profitability.profitable) {
        ui.warning(`Unprofitable conditions (EV: ${profitability.expectedValue.toFixed(6)} SOL) - waiting...`);
        logger.debug(`Motherload: ${motherloadOrb.toFixed(2)} ORB, ORB Price: ${profitability.orbPrice.toFixed(6)} SOL`);
        logger.debug(`${profitability.breakdownMessage}`);
        return false;
      } else {
        // Log profitability info at debug level
        logger.debug(`Production Cost Analysis (Profitable): ${profitability.breakdownMessage}`);
      }
    }

    // Check if round is still active
    if (new BN(currentSlot).gte(board.endSlot)) {
      logger.debug('Round has ended, waiting for new round...');
      return false;
    }

    // Execute deployment
    const solPerRound = automationInfo.costPerRound / 1e9;
    const remainingBalance = automationInfo.balance / 1e9;

    ui.mining(`Deploying ${solPerRound.toFixed(4)} SOL across 25 squares`);
    logger.debug(`Remaining balance: ${remainingBalance.toFixed(6)} SOL`);

    if (config.dryRun) {
      logger.info('[DRY RUN] Would execute automation deployment');
      return true;
    }

    // Build execute automation instructions (includes 0.1% dev fee + deploy)
    const instructions = await buildExecuteAutomationInstruction();
    const { signature, fee: actualFee } = await sendAndConfirmTransaction(instructions, 'Auto-Mine');

    ui.success(`Mining deployment complete`);
    logger.debug(`Transaction: ${signature}`);
    logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${signature}`);

    // Record deployment transaction and round
    try {
      const board = await fetchBoard();
      const treasury = await fetchTreasury();
      const motherloadOrb = Number(treasury.motherlode) / 1e9;

      // Get ORB price for transaction record
      const { priceInUsd: orbPriceUsd } = await getOrbPrice();

      // Calculate protocol fee
      const protocolFee = solPerRound * 0.10; // 10% protocol fee per deployment

      await recordTransaction({
        type: 'deploy',
        signature,
        roundId: board.roundId.toNumber(),
        solAmount: solPerRound,
        status: 'success',
        notes: `Deployed to 25 squares (motherload: ${motherloadOrb.toFixed(2)} ORB)`,
        orbPriceUsd,
        txFeeSol: actualFee,
        protocolFeeSol: protocolFee,
      });

      await recordRound(
        board.roundId.toNumber(),
        motherloadOrb,
        solPerRound,
        25,
        automationInfo.balance / 1e9,
        (automationInfo.balance - automationInfo.costPerRound) / 1e9
      );

      // Track deployment as in-flight (will show up in rewards 1-2 rounds later)
      await recordInFlightDeployment(board.roundId.toNumber(), solPerRound);
      logger.debug(`Added in-flight deployment: ${solPerRound.toFixed(4)} SOL for round ${board.roundId.toNumber()}`);
    } catch (error) {
      logger.error('Failed to record deployment:', error);
    }

    return true;
  } catch (error) {
    const errorMsg = String(error);

    // Handle checkpoint required error
    if (errorMsg.includes('not checkpointed') || errorMsg.includes('checkpoint')) {
      ui.info('Checkpointing previous rounds...');

      try {
        const { buildCheckpointInstruction } = await import('../utils/program');

        // Single checkpoint instruction handles all pending rounds
        const checkpointIx = await buildCheckpointInstruction();
        const { signature } = await sendAndConfirmTransaction([checkpointIx], 'Checkpoint');
        ui.success(`Checkpointed previous rounds`);
        logger.debug(`Transaction: ${signature}`);

        // Retry deployment after successful checkpoint
        if (!config.dryRun) {
          const instructions = await buildExecuteAutomationInstruction();
          const { signature: deploySig } = await sendAndConfirmTransaction(instructions, 'Auto-Mine');

          const solPerRound = automationInfo.costPerRound / 1e9;
          ui.success(`Mining deployment complete`);
          logger.debug(`Transaction: ${deploySig}`);
          logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${deploySig}`);
          return true;
        }

        return true;
      } catch (checkpointError: any) {
        const errorMsg = String(checkpointError.message || checkpointError);

        // "AlreadyProcessed" means checkpoint already done - try to deploy anyway
        if (errorMsg.includes('AlreadyProcessed')) {
          logger.debug('Rounds already checkpointed, attempting deployment...');

          // Try deployment since checkpoint is already done
          if (!config.dryRun) {
            try {
              const instructions = await buildExecuteAutomationInstruction();
              const { signature: deploySig } = await sendAndConfirmTransaction(instructions, 'Auto-Mine');

              const solPerRound = automationInfo.costPerRound / 1e9;
              ui.success(`Mining deployment complete`);
              logger.debug(`Transaction: ${deploySig}`);
              logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${deploySig}`);
              return true;
            } catch (deployError) {
              logger.error('Deployment failed after checkpoint:', deployError);
              return false;
            }
          }
          return true;
        } else {
          logger.error('Failed to checkpoint:', checkpointError);
          return false;
        }
      }
    }

    // Handle already-deployed error gracefully
    if (errorMsg.includes('already') || errorMsg.includes('duplicate')) {
      logger.debug('Already deployed for this round, waiting for next round...');
      return false;
    }

    logger.error('Auto-mine failed:', error);
    return false;
  }
}

/**
 * Main smart bot command - one command to rule them all
 */
export async function smartBotCommand(): Promise<void> {
  try {
    setupSignalHandlers();

    // Initialize database for PnL tracking
    ui.info('Initializing profit tracking database...');
    await initializeDatabase();

    // Load configuration from database (with default initialization)
    ui.info('Loading configuration from database...');
    let config = await loadAndCacheConfig();

    // Check if first-run setup is needed
    if (isSetupNeeded(config.privateKey)) {
      ui.blank();
      ui.header('🚀 FIRST-TIME SETUP REQUIRED');
      ui.blank();
      ui.error('PRIVATE_KEY not configured!');
      ui.blank();

      // Get dashboard port from configuration
      const port = await getDashboardPort();
      const setupUrl = `http://localhost:${port}/setup`;

      ui.info('The setup wizard has been opened in your browser.');
      ui.blank();
      ui.info('The wizard will guide you through:');
      ui.info('  • Wallet Private Key (encrypted & secure)');
      ui.info('  • RPC Endpoint (optional, has default)');
      ui.blank();
      ui.warning('Once setup is complete, restart the bot with: npm run start:bot');
      ui.blank();

      throw new Error(`Setup required - visit ${setupUrl}`);
    }

    ui.success('Configuration loaded successfully');
    ui.blank();

    ui.header('🤖 ORB MINING BOT - AUTONOMOUS MODE');
    ui.info('Fully automated mining • Press Ctrl+C to stop');
    ui.blank();

    // Check and set baseline if needed
    const baselineBalance = await getBaselineBalance();
    if (baselineBalance === 0) {
      ui.section('BASELINE SETUP');
      ui.info('No baseline found - setting current total value as starting point');

      const wallet = getWallet();
      const walletPublicKey = new PublicKey(wallet.publicKey.toBase58());

      // Get all current balances
      const walletBalances = await getBalances(walletPublicKey);
      const miner = await fetchMiner(walletPublicKey).catch(() => null);
      const stake = await fetchStake(walletPublicKey).catch(() => null);

      // Get automation balance if exists
      let automationSol = 0;
      try {
        const [automationPDA] = getAutomationPDA(walletPublicKey);
        const connection = getConnection();
        const automationAccountInfo = await connection.getAccountInfo(automationPDA);
        if (automationAccountInfo) {
          automationSol = automationAccountInfo.lamports / 1e9;
        }
      } catch (error) {
        // No automation account yet
      }

      // Get claimable balances
      const claimableSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
      const claimableOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
      const stakedOrb = stake ? Number(stake.balance) / 1e9 : 0;

      // Calculate total starting value (ONLY SOL - ORB only counts as profit when sold)
      const totalSol = walletBalances.sol + automationSol + claimableSol;
      const botOrb = walletBalances.orb + claimableOrb; // Bot ORB only (no staked)
      const totalStartingValue = totalSol; // Only SOL, ORB is profit when sold

      await setBaselineBalance(totalStartingValue);
      ui.success(`Baseline set: ${totalStartingValue.toFixed(4)} SOL (realized value only)`);
      ui.info(`  - SOL: ${totalSol.toFixed(4)} (wallet: ${walletBalances.sol.toFixed(4)}, automation: ${automationSol.toFixed(4)}, claimable: ${claimableSol.toFixed(4)})`);
      if (botOrb > 0) {
        ui.info(`  - Bot ORB: ${botOrb.toFixed(2)} (unrealized, becomes profit when swapped)`);
      }
      if (stakedOrb > 0) {
        ui.info(`  - Staked ORB: ${stakedOrb.toFixed(2)} (excluded from PnL)`);
      }
      ui.info('PnL tracks SOL only - ORB becomes profit when you swap it to SOL');
      ui.blank();
    } else {
      ui.section('BASELINE');
      ui.status('Starting Balance', `${baselineBalance.toFixed(4)} SOL`);
      ui.blank();
    }

    ui.section('BOT CONFIGURATION');
    ui.status('Motherload Threshold', `${config.motherloadThreshold} ORB`);
    ui.status('Auto-Claim SOL', `${config.autoClaimSolThreshold} SOL`);
    ui.status('Auto-Claim ORB', `${config.autoClaimOrbThreshold} ORB`);
    ui.status('Auto-Swap', config.autoSwapEnabled ? 'Enabled' : 'Disabled');
    ui.status('Auto-Stake', config.autoStakeEnabled ? 'Enabled' : 'Disabled');
    ui.blank();

    // Startup complete - unified PnL system handles reconciliation automatically

    ui.info('Bot is now running... Will create automation when motherload >= threshold');
    ui.blank();

    // Step 2: Main autonomous loop
    let lastRoundId = '';
    let deployedRounds = 0;

    while (isRunning) {
      try {
        // Get current round FIRST (priority: detect new rounds quickly)
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          ui.section(`ROUND ${currentRoundId}`);
          lastRoundId = currentRoundId;

          // Refresh config from database to pick up any setting changes from dashboard
          try {
            config = await refreshConfig();
            logger.debug('Configuration refreshed from database');
          } catch (error) {
            logger.warn('Failed to refresh config, using cached version:', error);
          }

          // Check motherload FIRST - don't create automation if below threshold
          const treasury = await fetchTreasury();
          const currentMotherload = Number(treasury.motherlode) / 1e9;
          logger.debug(`Current motherload: ${currentMotherload.toFixed(2)} ORB (threshold: ${config.motherloadThreshold} ORB)`);

          // Record motherload for analytics (track continuously, not just when mining)
          try {
            await recordMotherload(currentMotherload, board.roundId.toNumber());
          } catch (error) {
            logger.debug('Failed to record motherload:', error);
          }

          // If motherload below threshold, skip automation setup/deployment but still do claims/swaps
          if (currentMotherload < config.motherloadThreshold) {
            ui.info(`⏸️  Motherload (${currentMotherload.toFixed(2)} ORB) below threshold (${config.motherloadThreshold} ORB) - waiting...`);
            ui.info('Still checking for claimable rewards and performing swaps...');

            // Do periodic operations even when not mining
            await autoClaimMiningRewards();
            await autoClaimStakingRewards();
            await autoStakeOrb();
            await autoSwapCheck();
            await captureBalanceSnapshot();

            // Skip to next round check (don't create automation or deploy)
            continue;
          }

          // Motherload is above threshold - check/create automation
          let automationInfo = await getAutomationInfo();

          // Check if we should restart automation based on motherload changes
          if (automationInfo && await shouldRestartAutomation(currentMotherload)) {
            const restartSuccess = await restartAutomationForScaling();
            if (restartSuccess) {
              // Wait for new automation to propagate
              await sleep(2000);
              // Reload automation info
              automationInfo = await getAutomationInfo();
              if (!automationInfo) {
                logger.error('Failed to load automation after restart. Skipping this round.');
                continue;
              }
            } else {
              logger.warn('Restart failed, continuing with current automation.');
            }
          }

          // Create automation if it doesn't exist
          if (!automationInfo) {
            ui.info('Creating automation account for mining...');
            const setupSuccess = await autoSetupAutomation();

            if (!setupSuccess) {
              logger.error('Failed to create automation. Will retry next round.');
              continue;
            }

            // Wait for account propagation
            logger.debug('Waiting for new automation account to propagate...');
            await sleep(2000);

            // Reload automation info
            automationInfo = await getAutomationInfo();
            if (!automationInfo) {
              logger.error('Failed to load created automation info. Will retry next round.');
              continue;
            }

            const balance = automationInfo.balance / 1e9;
            const solPerRound = automationInfo.costPerRound / 1e9;
            const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

            ui.success('Automation created');
            ui.status('Budget', `${balance.toFixed(4)} SOL (~${estimatedRounds} rounds)`);
            ui.status('Per Round', `${solPerRound.toFixed(4)} SOL`);
          }

          // PRIORITY: Auto-mine the new round FIRST (before slow operations)
          const deployed = await autoMineRound(automationInfo);

          // Check automation balance after deployment attempt (success or failure)
          // This ensures we detect depletion even when deployment fails
          const updatedInfoAfterDeploy = await getAutomationInfo();
          if (updatedInfoAfterDeploy) {
            const remainingRounds = Math.floor(updatedInfoAfterDeploy.balance / updatedInfoAfterDeploy.costPerRound);

            // If depleted, close immediately (don't wait for next check)
            if (remainingRounds === 0) {
              logger.debug(`Automation depleted (balance: ${(updatedInfoAfterDeploy.balance / 1e9).toFixed(6)} SOL, need: ${(updatedInfoAfterDeploy.costPerRound / 1e9).toFixed(6)} SOL)`);
              ui.warning('Budget depleted - closing automation to reclaim SOL...');

              try {
                const closeInstruction = buildCloseAutomationInstruction();
                const { signature: closeSig, fee: actualFee } = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
                logger.debug(`Automation account closed: ${closeSig}`);
                ui.success('SOL reclaimed - will recreate automation on next round');

                // Record automation close
                try {
                  const returnedSol = updatedInfoAfterDeploy.balance / 1e9;
                  const { priceInUsd: orbPriceUsd } = await getOrbPrice();

                  await recordTransaction({
                    type: 'automation_close',
                    signature: closeSig,
                    solAmount: returnedSol,
                    status: 'success',
                    notes: `Budget depleted - closed for SOL reclaim (returned ${returnedSol.toFixed(6)} SOL)`,
                    orbPriceUsd,
                    txFeeSol: actualFee,
                  });
                } catch (error) {
                  logger.error('Failed to record automation close:', error);
                }

                // Clear persisted state since automation is closed
                clearState();
                setupMotherload = 0;
                logger.debug('Cleared automation state - will be reset on next setup');

                // Wait for closure to propagate before continuing
                await sleep(2000);
              } catch (closeError) {
                logger.error('Failed to close automation account:', closeError);
              }
            }
          }

          if (deployed) {
            deployedRounds++;
            ui.info(`Total rounds mined: ${deployedRounds}`);

            // Check remaining balance and fetch current state for PnL
            const wallet = getWallet();
            const updatedInfo = await getAutomationInfo();
            const miner = await fetchMiner(wallet.publicKey);
            const balances = await getBalances();

            if (updatedInfo) {
              const remainingRounds = Math.floor(updatedInfo.balance / updatedInfo.costPerRound);
              const remainingBalance = updatedInfo.balance / 1e9;
              ui.status('Remaining Budget', `${remainingBalance.toFixed(4)} SOL (~${remainingRounds} rounds)`);

              if (remainingRounds < 5 && remainingRounds > 0) {
                ui.warning(`Only ${remainingRounds} rounds remaining!`);
              }
            }

            // Cleanup old in-flight deployments before displaying PnL
            await cleanupOldInFlightDeployments();

            // Display quick PnL preview after each round with current balances
            const currentAutomationBalance = updatedInfo ? updatedInfo.balance / 1e9 : 0;
            const currentClaimableSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
            const currentClaimableOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
            const currentWalletOrb = balances.orb;

            // Get staked ORB
            let currentStakedOrb = 0;
            try {
              const currentStake = await fetchStake(wallet.publicKey);
              if (currentStake) {
                currentStakedOrb = Number(currentStake.balance) / 1e9;
              }
            } catch {
              // No stake account
            }

            await displayQuickPnL(
              currentAutomationBalance,
              currentClaimableSol,
              currentClaimableOrb,
              currentWalletOrb,
              currentStakedOrb
            );

            ui.blank();
          }
        }

        // AFTER deployment: Do periodic operations (claims, swaps, stakes)
        // These are slower and less time-sensitive than deployment
        // Skip these if budget is critically low (< 2 rounds) to prioritize deployment speed
        const currentInfo = await getAutomationInfo();
        if (currentInfo) {
          const remainingRounds = Math.floor(currentInfo.balance / currentInfo.costPerRound);

          if (remainingRounds >= 2) {
            // Normal operations: do claims, stakes, swaps, and balance snapshots
            await autoClaimMiningRewards();
            await autoClaimStakingRewards();
            await autoStakeOrb();
            await autoSwapCheck();
            await captureBalanceSnapshot();
          } else {
            // Critical budget: skip slow operations to avoid missing deployments
            logger.debug(`Skipping slow operations (${remainingRounds} rounds remaining)`);
          }
        } else {
          // No automation account (will recreate on next round)
          // Still do periodic operations since we're not deploying
          await autoClaimMiningRewards();
          await autoClaimStakingRewards();
          await autoStakeOrb();
          await autoSwapCheck();
          await captureBalanceSnapshot();
        }

        // Wait before checking again (interruptible sleep for fast Ctrl+C exit)
        const checkInterval = config.checkRoundIntervalMs || 10000;
        const sleepIncrement = 1000; // Check for shutdown every 1 second
        for (let i = 0; i < checkInterval && isRunning; i += sleepIncrement) {
          await sleep(Math.min(sleepIncrement, checkInterval - i));
        }

      } catch (error) {
        logger.error('Error in main loop:', error);
        // Interruptible error recovery sleep
        for (let i = 0; i < 5000 && isRunning; i += 1000) {
          await sleep(1000);
        }
      }
    }

    ui.blank();
    ui.header('BOT STOPPED');
    ui.info(`Total rounds mined: ${deployedRounds}`);
    ui.blank();

  } catch (error) {
    logger.error('Smart bot failed:', error);
    throw error;
  }
}
