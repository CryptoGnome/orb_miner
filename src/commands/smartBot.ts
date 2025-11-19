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
import { config } from '../utils/config';
import { sleep } from '../utils/retry';
import { TransactionInstruction, SystemProgram, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import logger, { ui } from '../utils/logger';
import {
  initializeDatabase,
  closeDatabase,
  recordTransaction,
  recordRound,
  recordBalance,
  recordPrice,
  getQuickPnLSnapshot
} from '../utils/database';

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

// Track recent deployments that haven't shown up in on-chain rewards yet
// This prevents PnL swings from on-chain reward lag (rewards appear 1-2 rounds after deployment)
interface InFlightDeployment {
  roundId: number;
  solAmount: number;
  timestamp: number;
}
let inFlightDeployments: InFlightDeployment[] = [];

/**
 * Clean up old in-flight deployments
 * Removes deployments older than 5 minutes (rewards should appear by then)
 * Or deployments more than 3 rounds old
 */
function cleanupInFlightDeployments(currentRoundId?: number): void {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  const maxRoundDiff = 3; // Remove if 3+ rounds ago

  const before = inFlightDeployments.length;
  inFlightDeployments = inFlightDeployments.filter(d => {
    const age = now - d.timestamp;
    const roundDiff = currentRoundId ? currentRoundId - d.roundId : 0;

    // Keep if less than 5 minutes old AND less than 3 rounds old
    return age < maxAge && roundDiff < maxRoundDiff;
  });

  const removed = before - inFlightDeployments.length;
  if (removed > 0) {
    logger.debug(`Cleaned up ${removed} old in-flight deployment(s)`);
  }
}

let isRunning = true;
let signalHandlersRegistered = false;
let lastRewardsCheck = 0;
let lastStakeCheck = 0;
let lastSwapCheck = 0;
let lastBalanceSnapshot = 0;
let setupMotherload = 0; // Track motherload at automation setup time for dynamic scaling

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
 * Calculate optimal rounds based on motherload (dynamic EV optimization)
 * Strategy: As motherload grows, deploy MORE per round (fewer total rounds, higher amount per square)
 * This maximizes EV when rewards are high while preserving capital at lower motherloads.
 *
 * Tiers (EXTREME CONSERVATIVE - Monte Carlo optimized for maximum ROI):
 * Based on 10,000-simulation Monte Carlo analysis showing +139% avg ROI vs +74% with previous settings
 * - 0-199 ORB: Maximum conservation (880 rounds, ~0.11% per round)
 * - 200-299 ORB: Extreme conservation (440 rounds, ~0.23% per round)
 * - 300-399 ORB: Ultra conservative (400 rounds, ~0.25% per round)
 * - 400-499 ORB: Very conservative (360 rounds, ~0.28% per round)
 * - 500-599 ORB: Conservative (320 rounds, ~0.31% per round)
 * - 600-699 ORB: Moderate-Conservative (280 rounds, ~0.36% per round)
 * - 700-799 ORB: Moderate (240 rounds, ~0.42% per round)
 * - 800-899 ORB: Moderate-Aggressive (200 rounds, 0.5% per round)
 * - 900-999 ORB: Aggressive (160 rounds, ~0.63% per round)
 * - 1000-1099 ORB: Very aggressive (120 rounds, ~0.83% per round)
 * - 1100-1199 ORB: Very aggressive (90 rounds, ~1.11% per round)
 * - 1200+ ORB: Ultra aggressive (60 rounds, ~1.67% per round)
 */
function calculateTargetRounds(motherloadOrb: number): number {
  // Ultra aggressive for massive motherloads (1200+ ORB)
  if (motherloadOrb >= 1200) {
    return 60; // ~1.67% of budget per round - +76% ROI per simulation
  }

  // Very aggressive (1100-1199 ORB)
  if (motherloadOrb >= 1100) {
    return 90; // ~1.11% of budget per round - +101% ROI per simulation
  }

  // Very aggressive (1000-1099 ORB)
  if (motherloadOrb >= 1000) {
    return 120; // ~0.83% of budget per round - +125% ROI per simulation
  }

  // Aggressive (900-999 ORB)
  if (motherloadOrb >= 900) {
    return 160; // ~0.63% of budget per round - +146% ROI per simulation
  }

  // Moderate-Aggressive (800-899 ORB)
  if (motherloadOrb >= 800) {
    return 200; // 0.5% of budget per round - +162% ROI per simulation
  }

  // Moderate (700-799 ORB)
  if (motherloadOrb >= 700) {
    return 240; // ~0.42% of budget per round - +172% ROI per simulation (PEAK)
  }

  // Moderate-Conservative (600-699 ORB)
  if (motherloadOrb >= 600) {
    return 280; // ~0.36% of budget per round - +172% ROI per simulation
  }

  // Conservative (500-599 ORB)
  if (motherloadOrb >= 500) {
    return 320; // ~0.31% of budget per round - +165% ROI per simulation
  }

  // Very conservative (400-499 ORB)
  if (motherloadOrb >= 400) {
    return 360; // ~0.28% of budget per round - +151% ROI per simulation
  }

  // Ultra conservative (300-399 ORB)
  if (motherloadOrb >= 300) {
    return 400; // ~0.25% of budget per round - +125% ROI per simulation
  }

  // Extreme conservation (200-299 ORB)
  if (motherloadOrb >= 200) {
    return 440; // ~0.23% of budget per round
  }

  // Maximum conservation (below 200 ORB)
  return 880; // ~0.11% of budget per round - extremely small bets on minimal rewards
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

    // Calculate usable budget
    const usableBudget = solBalance * (config.initialAutomationBudgetPct / 100);
    ui.status('Allocating', `${usableBudget.toFixed(4)} SOL (${config.initialAutomationBudgetPct}%)`);

    if (usableBudget < 0.5) {
      ui.error('Insufficient balance - need at least 0.56 SOL');
      return false;
    }

    // Get current motherload for smart allocation
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;
    ui.status('Current Motherload', `${motherloadOrb.toFixed(2)} ORB`);

    // Calculate target rounds based on motherload
    const targetRounds = calculateTargetRounds(motherloadOrb);
    const totalSquares = targetRounds * 25;
    const solPerSquare = usableBudget / totalSquares;
    const solPerRound = solPerSquare * 25;

    ui.status('Strategy', `${targetRounds} rounds @ ${solPerRound.toFixed(4)} SOL/round`);

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
    const signature = await sendAndConfirmTransaction([instruction], 'Setup Automation');
    ui.success('Automation account created!');
    logger.debug(`Transaction: ${signature}`);

    // Track setup motherload for dynamic scaling
    setupMotherload = motherloadOrb;
    logger.debug(`Tracking setup motherload: ${setupMotherload.toFixed(2)} ORB`);

    // Record automation setup in database
    try {
      await recordTransaction({
        type: 'automation_setup',
        signature,
        solAmount: deposit,
        status: 'success',
        notes: `Setup with ${targetRounds} rounds @ ${solPerRound.toFixed(4)} SOL/round (motherload: ${motherloadOrb.toFixed(2)} ORB)`,
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
 * Display quick PnL preview with current balances
 *
 * @param automationBalance - Current automation account balance in SOL
 * @param claimableSol - Pending claimable SOL rewards
 * @param claimableOrb - Pending claimable ORB rewards
 * @param walletOrb - Current wallet ORB balance
 *
 * Uses the same calculation logic as the full PnL report for consistency.
 * Tracks in-flight deployments (spent but rewards not visible yet) and displays
 * them separately for informational purposes. In-flight SOL is NOT added to current
 * value since it has already been spent from the automation account.
 */
async function displayQuickPnL(
  automationBalance: number,
  claimableSol: number,
  claimableOrb: number,
  walletOrb: number
): Promise<void> {
  try {
    // Calculate total in-flight SOL (deployments not yet reflected on-chain)
    const inFlightSol = inFlightDeployments.reduce((sum, d) => sum + d.solAmount, 0);
    const inFlightCount = inFlightDeployments.length;

    const pnl = await getQuickPnLSnapshot(
      automationBalance,
      claimableSol, // Use raw value (don't add in-flight - it's already spent!)
      claimableOrb,
      walletOrb
    );

    // Calculate ROI
    const roi = pnl.totalDeployedSol > 0 ? (pnl.netSolPnl / pnl.totalDeployedSol) * 100 : 0;
    const pnlColor = pnl.netSolPnl >= 0 ? '✅' : '❌';

    // Calculate total current value for verification
    const totalCurrentValue = pnl.totalClaimedSol + pnl.totalSwappedSol + automationBalance + claimableSol;

    // Display compact PnL summary with full calculation breakdown
    logger.info('───────────────────────────────────────────────');
    logger.info(`💰 Net PnL: ${pnlColor} ${pnl.netSolPnl >= 0 ? '+' : ''}${pnl.netSolPnl.toFixed(4)} SOL (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}% ROI)`);
    logger.info(`📊 Capital Deployed: ${pnl.totalDeployedSol.toFixed(4)} SOL (automation setup only)`);
    logger.info(`📈 Current Value: ${totalCurrentValue.toFixed(4)} SOL`);
    logger.info(`   = ${pnl.totalClaimedSol.toFixed(4)} claimed + ${pnl.totalSwappedSol.toFixed(4)} swapped + ${automationBalance.toFixed(4)} automation + ${claimableSol.toFixed(4)} pending`);

    // Show in-flight as informational (not included in current value since it's already spent)
    if (inFlightCount > 0) {
      logger.info(`⏳ In-Flight: ${inFlightSol.toFixed(4)} SOL (${inFlightCount} round${inFlightCount > 1 ? 's' : ''} waiting for rewards)`);
    }

    logger.info(`🪙 ORB Balance: ${pnl.netOrbBalance.toFixed(2)} ORB`);
    logger.info(`   = ${pnl.totalClaimedOrb.toFixed(2)} claimed - ${pnl.totalSwappedOrb.toFixed(2)} swapped + ${claimableOrb.toFixed(2)} pending + ${walletOrb.toFixed(2)} wallet`);
    logger.info('───────────────────────────────────────────────');
  } catch (error) {
    logger.debug('Failed to display quick PnL:', error);
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

    await recordBalance(
      balances.sol,
      balances.orb,
      automationInfo ? automationInfo.balance / 1e9 : 0,
      miner ? Number(miner.rewardsSol) / 1e9 : 0,
      miner ? Number(miner.rewardsOre) / 1e9 : 0,
      stake ? Number(stake.balance) / 1e9 : 0
    );

    // Also capture ORB price
    const { priceInUsd, priceInSol } = await getOrbPrice();
    if (priceInUsd > 0 && priceInSol > 0) {
      await recordPrice(priceInUsd, priceInSol);
    }

    logger.debug('Captured balance snapshot');
  } catch (error) {
    logger.error('Failed to capture balance snapshot:', error);
  }
}

/**
 * Auto-claim: Check and claim rewards when thresholds are met
 */
async function autoClaimRewards(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastRewardsCheck < config.checkRewardsIntervalMs) {
      return;
    }
    lastRewardsCheck = now;

    logger.debug('Checking rewards for auto-claim...');
    const wallet = getWallet();
    const instructions: TransactionInstruction[] = [];

    // Check mining rewards
    const miner = await fetchMiner(wallet.publicKey);
    if (miner) {
      const miningSol = Number(miner.rewardsSol) / 1e9;
      const miningOrb = Number(miner.rewardsOre) / 1e9;

      // Auto-claim SOL
      if (miningSol >= config.autoClaimSolThreshold) {
        ui.claim(`Claiming ${miningSol.toFixed(4)} SOL (mining rewards)`);
        instructions.push(buildClaimSolInstruction());
      }

      // Auto-claim ORB from mining
      if (miningOrb >= config.autoClaimOrbThreshold) {
        ui.claim(`Claiming ${miningOrb.toFixed(2)} ORB (mining rewards)`);
        instructions.push(await buildClaimOreInstruction());
      }
    }

    // Send mining claims first (if any)
    if (instructions.length > 0 && !config.dryRun) {
      const signature = await sendAndConfirmTransaction(instructions, 'Auto-Claim Mining');
      ui.success(`Claimed mining rewards`);
      logger.debug(`Transaction: ${signature}`);

      // Record claim transactions
      try {
        if (miner) {
          const miningSol = Number(miner.rewardsSol) / 1e9;
          const miningOrb = Number(miner.rewardsOre) / 1e9;

          if (miningSol >= config.autoClaimSolThreshold) {
            await recordTransaction({
              type: 'claim_sol',
              signature,
              solAmount: miningSol,
              status: 'success',
              notes: 'Mining rewards',
            });
          }

          if (miningOrb >= config.autoClaimOrbThreshold) {
            await recordTransaction({
              type: 'claim_orb',
              signature,
              orbAmount: miningOrb,
              status: 'success',
              notes: 'Mining rewards',
            });
          }
        }
      } catch (error) {
        logger.error('Failed to record claim:', error);
      }

      // Cleanup in-flight deployments since on-chain state just updated
      cleanupInFlightDeployments();
    }

    // Check staking rewards (separate transaction to avoid failing mining claims)
    const stake = await fetchStake(wallet.publicKey);
    if (stake) {
      const stakedAmount = Number(stake.balance) / 1e9;

      if (stakedAmount > 0 && !config.dryRun) {
        logger.debug(`Staking: ${stakedAmount.toFixed(2)} ORB staked, attempting to claim ${config.autoClaimStakingOrbThreshold} ORB...`);

        try {
          const claimInstruction = await buildClaimYieldInstruction(config.autoClaimStakingOrbThreshold);
          const signature = await sendAndConfirmTransaction([claimInstruction], 'Auto-Claim Staking');
          ui.success(`Claimed staking rewards`);
          logger.debug(`Attempted to claim ${config.autoClaimStakingOrbThreshold} ORB from staking`);
          logger.debug(`Transaction: ${signature}`);
        } catch (error: any) {
          logger.debug(`Staking claim not ready (insufficient rewards from buybacks): ${error.message || error}`);
        }
      }
    } else {
      logger.debug('No stake account found (not staking)');
    }
  } catch (error) {
    logger.error('Auto-claim failed:', error);
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
    const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation for Scaling');
    logger.debug(`Automation closed: ${closeSig}`);

    // Record automation close with returned SOL amount
    try {
      await recordTransaction({
        type: 'automation_close',
        signature: closeSig,
        solAmount: returnedSol,
        status: 'success',
        notes: `Closed for dynamic scaling - returned ${returnedSol.toFixed(4)} SOL to wallet`,
      });
    } catch (error) {
      logger.error('Failed to record automation close:', error);
    }

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
        await recordTransaction({
          type: 'swap',
          signature: result.signature,
          orbAmount: orbToSwap,
          solAmount: result.solReceived,
          status: 'success',
          notes: `Swapped ORB to SOL (proactive selling)`,
        });
      } catch (error) {
        logger.error('Failed to record swap:', error);
      }
    } else {
      logger.error('❌ Auto-swap failed');

      // Record failed swap
      try {
        await recordTransaction({
          type: 'swap',
          orbAmount: orbToSwap,
          status: 'failed',
          notes: 'Swap failed - check logs for details',
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

      const instruction = await buildStakeInstruction(stakeAmount);
      const signature = await sendAndConfirmTransaction([instruction], 'Auto-Stake');
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
        const checkpointSig = await sendAndConfirmTransaction([checkpointIx], 'Checkpoint');
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

    // Build execute automation instruction (discriminator 0x06)
    const instruction = await buildExecuteAutomationInstruction();
    const signature = await sendAndConfirmTransaction([instruction], 'Auto-Mine');

    ui.success(`Mining deployment complete`);
    logger.debug(`Transaction: ${signature}`);
    logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${signature}`);

    // Record deployment transaction and round
    try {
      const board = await fetchBoard();
      const treasury = await fetchTreasury();
      const motherloadOrb = Number(treasury.motherlode) / 1e9;

      await recordTransaction({
        type: 'deploy',
        signature,
        roundId: board.roundId.toNumber(),
        solAmount: solPerRound,
        status: 'success',
        notes: `Deployed to 25 squares (motherload: ${motherloadOrb.toFixed(2)} ORB)`,
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
      inFlightDeployments.push({
        roundId: board.roundId.toNumber(),
        solAmount: solPerRound,
        timestamp: Date.now(),
      });
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
        const signature = await sendAndConfirmTransaction([checkpointIx], 'Checkpoint');
        ui.success(`Checkpointed previous rounds`);
        logger.debug(`Transaction: ${signature}`);

        // Retry deployment after successful checkpoint
        if (!config.dryRun) {
          const instruction = await buildExecuteAutomationInstruction();
          const deploySig = await sendAndConfirmTransaction([instruction], 'Auto-Mine');

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
              const instruction = await buildExecuteAutomationInstruction();
              const deploySig = await sendAndConfirmTransaction([instruction], 'Auto-Mine');

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

    ui.header('🤖 ORB MINING BOT - AUTONOMOUS MODE');
    ui.info('Fully automated mining • Press Ctrl+C to stop');
    ui.blank();

    ui.section('BOT CONFIGURATION');
    ui.status('Motherload Threshold', `${config.motherloadThreshold} ORB`);
    ui.status('Auto-Claim SOL', `${config.autoClaimSolThreshold} SOL`);
    ui.status('Auto-Claim ORB', `${config.autoClaimOrbThreshold} ORB`);
    ui.status('Auto-Swap', config.autoSwapEnabled ? 'Enabled' : 'Disabled');
    ui.status('Auto-Stake', config.autoStakeEnabled ? 'Enabled' : 'Disabled');
    ui.blank();
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

          // Check motherload FIRST - don't create automation if below threshold
          const treasury = await fetchTreasury();
          const currentMotherload = Number(treasury.motherlode) / 1e9;
          logger.debug(`Current motherload: ${currentMotherload.toFixed(2)} ORB (threshold: ${config.motherloadThreshold} ORB)`);

          // If motherload below threshold, skip mining this round
          if (currentMotherload < config.motherloadThreshold) {
            ui.info(`⏸️  Motherload (${currentMotherload.toFixed(2)} ORB) below threshold (${config.motherloadThreshold} ORB) - waiting...`);
            continue; // Skip to next round check
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
                const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
                logger.debug(`Automation account closed: ${closeSig}`);
                ui.success('SOL reclaimed - will recreate automation on next round');

                // Record automation close
                try {
                  const returnedSol = updatedInfoAfterDeploy.balance / 1e9;
                  await recordTransaction({
                    type: 'automation_close',
                    signature: closeSig,
                    solAmount: returnedSol,
                    status: 'success',
                    notes: `Budget depleted - closed for SOL reclaim (returned ${returnedSol.toFixed(6)} SOL)`,
                  });
                } catch (error) {
                  logger.error('Failed to record automation close:', error);
                }

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
            const board = await fetchBoard();
            cleanupInFlightDeployments(board.roundId.toNumber());

            // Display quick PnL preview after each round with current balances
            const currentAutomationBalance = updatedInfo ? updatedInfo.balance / 1e9 : 0;
            const currentClaimableSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
            const currentClaimableOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
            const currentWalletOrb = balances.orb;

            await displayQuickPnL(
              currentAutomationBalance,
              currentClaimableSol,
              currentClaimableOrb,
              currentWalletOrb
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
            await autoClaimRewards();
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
          await autoClaimRewards();
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
