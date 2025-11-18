import { getWallet, getBalances, getSolBalance } from '../utils/wallet';
import {
  getAutomationPDA,
  getMinerPDA,
  fetchBoard,
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
import { TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import logger from '../utils/logger';

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

let isRunning = true;
let signalHandlersRegistered = false;
let lastRewardsCheck = 0;
let lastStakeCheck = 0;
let lastSwapCheck = 0;
let setupMotherload = 0; // Track motherload at automation setup time for dynamic scaling

// Setup graceful shutdown
function setupSignalHandlers() {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdownHandler = () => {
    if (isRunning) {
      logger.info('\nShutdown signal received, stopping gracefully...');
      isRunning = false;
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
 * This maximizes EV when rewards are high.
 *
 * Tiers:
 * - 0-199 ORB: Don't mine (below minimum threshold)
 * - 200-299 ORB: Very conservative (120 rounds, small amounts)
 * - 300-399 ORB: Conservative (100 rounds)
 * - 400-499 ORB: Moderate (80 rounds)
 * - 500-599 ORB: Aggressive (60 rounds)
 * - 600-699 ORB: Very aggressive (45 rounds)
 * - 700-999 ORB: Maximum aggression (30 rounds)
 * - 1000+ ORB: Ultra aggressive (20 rounds, very large amounts)
 */
function calculateTargetRounds(motherloadOrb: number): number {
  // Ultra aggressive for massive motherloads (1000+ ORB)
  if (motherloadOrb >= 1000) {
    return 20; // 5% of budget per round - huge bets on huge rewards
  }

  // Maximum aggression (700-999 ORB)
  if (motherloadOrb >= 700) {
    return 30; // ~3.3% of budget per round
  }

  // Very aggressive (600-699 ORB)
  if (motherloadOrb >= 600) {
    return 45; // ~2.2% of budget per round
  }

  // Aggressive (500-599 ORB)
  if (motherloadOrb >= 500) {
    return 60; // ~1.67% of budget per round
  }

  // Moderate (400-499 ORB)
  if (motherloadOrb >= 400) {
    return 80; // ~1.25% of budget per round
  }

  // Conservative (300-399 ORB)
  if (motherloadOrb >= 300) {
    return 100; // 1% of budget per round
  }

  // Very conservative (200-299 ORB)
  return 120; // ~0.83% of budget per round - small bets on small rewards
}

/**
 * Calculate expected ORB rewards per round based on mining mechanics
 *
 * Per Round Rewards:
 * - Base: +4 ORB minted per round (split among winners on winning block)
 *   - 50% of time: split proportionally among all winners
 *   - 50% of time: one winner gets all 4 ORB (weighted random)
 * - Motherload: +0.8 ORB added per round, 1/625 chance to hit
 *   - When hit: split proportionally among winners
 * - Refining Fee: 10% on claimed rewards (redistributed to holders)
 *
 * @param motherloadOrb Current motherload size in ORB
 * @param ourSquares Number of squares we're deploying to (typically 25)
 * @param estimatedCompetitionMultiplier Estimated competition level (1 = just us, 2 = double competition, etc.)
 * @returns Expected ORB rewards before refining fee
 */
function calculateExpectedOrbRewards(
  motherloadOrb: number,
  ourSquares: number = 25,
  estimatedCompetitionMultiplier: number = 10 // Conservative estimate: assume 10x our deployment
): number {
  // Our chance of having the winning block (assuming equal deployment across squares)
  // If we deploy to all 25 squares and competition is 10x, we have ~9% of total deployment
  const ourShareOfTotal = ourSquares / (ourSquares * estimatedCompetitionMultiplier);

  // Base reward: 4 ORB per round
  // 50% split proportionally, 50% winner-takes-all (weighted random)
  // Expected value = 0.5 × (our_share × 4) + 0.5 × (our_share × 4) = our_share × 4
  const baseRewardExpected = ourShareOfTotal * 4;

  // Motherload reward: 1/625 chance to hit, split proportionally if we're on winning block
  const motherloadChance = 1 / 625;
  const motherloadExpected = motherloadChance * ourShareOfTotal * motherloadOrb;

  // Total expected ORB (before 10% refining fee)
  const totalExpected = baseRewardExpected + motherloadExpected;

  // After 10% refining fee (we lose 10% when claiming)
  const afterRefining = totalExpected * 0.9;

  return afterRefining;
}

/**
 * Calculate expected SOL returns from losing blocks
 *
 * When we win, we get SOL from all losing blocks split proportionally.
 * This is difficult to estimate without knowing total deployment patterns.
 *
 * @param ourDeploymentSol SOL we're deploying
 * @param _estimatedTotalDeployment Estimated total SOL deployed by all miners (for future use)
 * @returns Expected SOL returned (very rough estimate)
 */
function calculateExpectedSolReturns(
  ourDeploymentSol: number,
  _estimatedTotalDeployment: number
): number {
  // If we deploy X SOL and win, we get back:
  // - Our X SOL (on losing blocks)
  // - Share of other miners' SOL on losing blocks
  //
  // Very rough estimate: if total deployment is Y and we have X/Y share,
  // we expect to get back approximately our share of the pot when we win
  //
  // This is highly variable and depends on competition patterns
  // For safety, assume we break even on SOL (conservative)

  return ourDeploymentSol * 0.95; // Assume we get 95% of our SOL back on average
}

/**
 * Check if mining is profitable based on production cost analysis
 *
 * EV = (Expected ORB × ORB Price in SOL) + Expected SOL Back - Production Cost
 *
 * @param costPerRound SOL deployed per round (production cost)
 * @param motherloadOrb Current motherload in ORB
 * @returns Object with profitability info
 */
async function isProfitableToMine(
  costPerRound: number,
  motherloadOrb: number
): Promise<{
  profitable: boolean;
  expectedValue: number;
  productionCost: number;
  expectedReturns: number;
  orbPrice: number;
  breakdownMessage: string;
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

    // Calculate expected rewards (use config's competition multiplier)
    const competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
    const expectedOrbRewards = calculateExpectedOrbRewards(motherloadOrb, 25, competitionMultiplier);
    const expectedSolBack = calculateExpectedSolReturns(costPerRound, costPerRound * competitionMultiplier);

    // Calculate expected value in SOL
    const orbRewardValueInSol = expectedOrbRewards * orbPrice;
    const totalExpectedReturns = orbRewardValueInSol + expectedSolBack;
    const expectedValue = totalExpectedReturns - costPerRound;

    // Mining is profitable if EV > 0 (or above minimum threshold from config)
    const minEV = config.minExpectedValue || 0; // Add config option for minimum EV
    const profitable = expectedValue >= minEV;

    // Build breakdown message
    const breakdownMessage = [
      `Production Cost: ${costPerRound.toFixed(6)} SOL`,
      `Expected ORB: ${expectedOrbRewards.toFixed(4)} ORB × ${orbPrice.toFixed(6)} SOL = ${orbRewardValueInSol.toFixed(6)} SOL`,
      `Expected SOL Back: ${expectedSolBack.toFixed(6)} SOL`,
      `Total Expected Returns: ${totalExpectedReturns.toFixed(6)} SOL`,
      `Expected Value (EV): ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`,
      `Profitable: ${profitable ? '✅ YES' : '❌ NO'}`,
    ].join('\n  ');

    return {
      profitable,
      expectedValue,
      productionCost: costPerRound,
      expectedReturns: totalExpectedReturns,
      orbPrice,
      breakdownMessage,
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
    logger.info('='.repeat(60));
    logger.info('AUTO-SETUP: Creating Automation Account');
    logger.info('='.repeat(60));

    const wallet = getWallet();
    const solBalance = await getSolBalance();
    logger.info(`Current SOL Balance: ${solBalance.toFixed(4)} SOL`);

    // Calculate usable budget
    const usableBudget = solBalance * (config.initialAutomationBudgetPct / 100);
    logger.info(`Usable Budget (${config.initialAutomationBudgetPct}%): ${usableBudget.toFixed(4)} SOL`);

    if (usableBudget < 0.5) {
      logger.error('❌ Insufficient SOL balance. Need at least 0.56 SOL (0.5 usable + 0.06 reserve)');
      return false;
    }

    // Get current motherload for smart allocation
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;
    logger.info(`Current Motherload: ${motherloadOrb.toFixed(2)} ORB`);

    // Calculate target rounds based on motherload
    const targetRounds = calculateTargetRounds(motherloadOrb);
    const totalSquares = targetRounds * 25;
    const solPerSquare = usableBudget / totalSquares;
    const solPerRound = solPerSquare * 25;

    logger.info(`Target Rounds: ${targetRounds} (based on ${motherloadOrb.toFixed(0)} ORB motherload)`);
    logger.info(`SOL per square: ${solPerSquare.toFixed(6)} SOL`);
    logger.info(`SOL per round: ${solPerRound.toFixed(4)} SOL`);

    if (config.dryRun) {
      logger.info('[DRY RUN] Would create automation account');
      return true;
    }

    // Create automation account
    const deposit = usableBudget;
    const feePerExecution = 0.00001; // Minimal self-execution fee
    const strategy = AutomationStrategy.Random;
    const squareMask = 25n; // All 25 squares

    const instruction = buildAutomateInstruction(
      solPerSquare,
      deposit,
      feePerExecution,
      strategy,
      squareMask,
      wallet.publicKey
    );

    logger.info('Creating automation account...');
    const signature = await sendAndConfirmTransaction([instruction], 'Setup Automation');

    logger.info('✅ Automation account created successfully!');
    logger.info(`Transaction: ${signature}`);
    logger.info(`Will run for approximately ${targetRounds} rounds`);

    // Track setup motherload for dynamic scaling
    setupMotherload = motherloadOrb;
    logger.info(`📊 Tracking setup motherload: ${setupMotherload.toFixed(2)} ORB`);

    return true;
  } catch (error) {
    logger.error('Auto-setup failed:', error);
    return false;
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
        logger.info(`Mining SOL rewards (${miningSol.toFixed(4)}) >= threshold (${config.autoClaimSolThreshold}), claiming...`);
        instructions.push(buildClaimSolInstruction());
      }

      // Auto-claim ORB from mining
      if (miningOrb >= config.autoClaimOrbThreshold) {
        logger.info(`Mining ORB rewards (${miningOrb.toFixed(2)}) >= threshold (${config.autoClaimOrbThreshold}), claiming...`);
        instructions.push(await buildClaimOreInstruction());
      }
    }

    // Send mining claims first (if any)
    if (instructions.length > 0 && !config.dryRun) {
      const signature = await sendAndConfirmTransaction(instructions, 'Auto-Claim Mining');
      logger.info(`✅ Auto-claim mining successful: ${signature}`);
    }

    // Check staking rewards (separate transaction to avoid failing mining claims)
    // Note: Staking rewards come from buybacks and are calculated on-chain by the program.
    // The 'rewards' field in the stake account doesn't reflect claimable amount.
    // We attempt to claim the threshold amount and let the program decide if enough is available.
    const stake = await fetchStake(wallet.publicKey);
    if (stake) {
      const stakedAmount = Number(stake.balance) / 1e9;

      if (stakedAmount > 0 && !config.dryRun) {
        logger.debug(`Staking: ${stakedAmount.toFixed(2)} ORB staked, attempting to claim ${config.autoClaimStakingOrbThreshold} ORB...`);

        try {
          // Try to claim the threshold amount
          // If the program has enough rewards available (from buybacks), it will succeed
          // If not enough has accumulated, the transaction will fail (silently) and we'll try again next time
          const claimInstruction = await buildClaimYieldInstruction(config.autoClaimStakingOrbThreshold);
          const signature = await sendAndConfirmTransaction([claimInstruction], 'Auto-Claim Staking');
          logger.info(`✅ Auto-claim staking successful: ${signature} (${config.autoClaimStakingOrbThreshold} ORB)`);
        } catch (error: any) {
          // This is expected if not enough rewards have accumulated from buybacks yet
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
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('🚀 MOTHERLOAD GROWTH DETECTED');
    logger.info(`Setup: ${setupMotherload.toFixed(2)} ORB → Current: ${currentMotherload.toFixed(2)} ORB`);
    logger.info(`Change: +${percentChange.toFixed(1)}% (+${absoluteChange.toFixed(0)} ORB)`);
    logger.info('💡 Restarting automation with larger deployment amounts...');
    logger.info('='.repeat(60));
    return true;
  }

  if (shouldDecrease) {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('📉 MOTHERLOAD DECREASE DETECTED');
    logger.info(`Setup: ${setupMotherload.toFixed(2)} ORB → Current: ${currentMotherload.toFixed(2)} ORB`);
    logger.info(`Change: ${percentChange.toFixed(1)}% (${absoluteChange.toFixed(0)} ORB)`);
    logger.info('💡 Restarting automation with smaller deployment amounts...');
    logger.info('='.repeat(60));
    return true;
  }

  return false;
}

/**
 * Close current automation and restart with new amounts based on current motherload
 */
async function restartAutomationForScaling(): Promise<boolean> {
  try {
    logger.info('Closing current automation account...');
    const closeInstruction = buildCloseAutomationInstruction();
    const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation for Scaling');
    logger.info(`✅ Automation closed: ${closeSig}`);

    // Wait for closure to propagate
    await sleep(2000);

    // Recreate with current motherload (autoSetupAutomation fetches it automatically)
    logger.info('Recreating automation with updated amounts...');
    const setupSuccess = await autoSetupAutomation();

    if (setupSuccess) {
      logger.info('✅ Automation successfully restarted with optimized amounts!');
      return true;
    } else {
      logger.error('❌ Failed to recreate automation');
      return false;
    }
  } catch (error) {
    logger.error('Failed to restart automation:', error);
    return false;
  }
}

/**
 * Auto-swap: Refund automation account by swapping ORB to SOL when balance is low
 */
async function autoRefundAutomation(automationInfo: any): Promise<boolean> {
  try {
    // Check if automation balance is below threshold
    const balanceSol = automationInfo.balance / 1e9;
    if (balanceSol >= config.minAutomationBalance) {
      return true; // Balance is sufficient
    }

    logger.warn(`⚠️  Automation balance low: ${balanceSol.toFixed(6)} SOL (threshold: ${config.minAutomationBalance})`);

    if (!config.autoSwapEnabled) {
      logger.warn('Auto-swap disabled. Please refund automation manually or enable AUTO_SWAP_ENABLED.');
      return false;
    }

    // Get total ORB balance
    const balances = await getBalances();
    const orbToSwap = Math.max(0, balances.orb - config.minOrbToKeep);

    if (orbToSwap < config.minOrbSwapAmount) {
      logger.error(`❌ Insufficient ORB to swap. Have: ${balances.orb.toFixed(2)}, Reserve: ${config.minOrbToKeep}, Min Swap: ${config.minOrbSwapAmount}`);
      logger.warn('💡 Tip: Lower MIN_ORB_TO_KEEP or MIN_ORB_SWAP_AMOUNT in .env or claim more ORB rewards');
      return false;
    }

    // Check if ORB price meets minimum threshold
    if (config.minOrbPriceUsd > 0) {
      logger.info('Checking ORB price before swapping...');
      const { priceInUsd } = await getOrbPrice();

      if (priceInUsd === 0) {
        logger.warn('⚠️  Could not fetch ORB price. Skipping swap for safety.');
        logger.warn('💡 Set MIN_ORB_PRICE_USD=0 in .env to swap without price check');
        return false;
      }

      if (priceInUsd < config.minOrbPriceUsd) {
        logger.warn(`⚠️  ORB price too low: $${priceInUsd.toFixed(2)} (minimum: $${config.minOrbPriceUsd.toFixed(2)})`);
        logger.info('💡 Waiting for better price before swapping. Will check again next cycle.');
        return false;
      }

      logger.info(`✅ ORB price acceptable: $${priceInUsd.toFixed(2)} (minimum: $${config.minOrbPriceUsd.toFixed(2)})`);
    }

    // Swap ALL available ORB
    logger.info(`Swapping ALL available ORB to refund automation...`);
    logger.info(`Total ORB: ${balances.orb.toFixed(2)} | Reserve: ${config.minOrbToKeep} | Swapping: ${orbToSwap.toFixed(2)}`);

    const result = await swapOrbToSol(orbToSwap, config.slippageBps);

    if (result.success && result.solReceived) {
      logger.info(`✅ Auto-swap successful! Received ${result.solReceived.toFixed(4)} SOL`);

      // Transfer SOL to automation PDA
      const wallet = getWallet();
      const [automationPDA] = getAutomationPDA(wallet.publicKey);
      const transferAmount = Math.floor(result.solReceived * LAMPORTS_PER_SOL);

      logger.info(`Transferring ${result.solReceived.toFixed(4)} SOL to automation account...`);

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: automationPDA,
        lamports: transferAmount,
      });

      if (!config.dryRun) {
        const signature = await sendAndConfirmTransaction([transferInstruction], 'Refund Automation');
        logger.info(`✅ Transfer completed: ${signature}`);

        // Wait a moment and re-check if automation balance actually updated
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedInfo = await getAutomationInfo();

        if (!updatedInfo) {
          logger.error('❌ Failed to fetch updated automation info');
          return false;
        }

        const updatedBalanceSol = updatedInfo.balance / 1e9;
        logger.info(`Automation balance after transfer: ${updatedBalanceSol.toFixed(6)} SOL`);

        // Check if balance actually increased
        if (updatedBalanceSol < balanceSol + (result.solReceived * 0.5)) {
          logger.warn('⚠️  Transfer succeeded but automation balance did not update!');
          logger.warn('💡 ORB program tracks balance internally - direct transfers don\'t work.');
          logger.info('🔄 Automatically closing and recreating automation account...');

          // Close automation account to reclaim SOL
          const closeInstruction = buildCloseAutomationInstruction();
          try {
            const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
            logger.info(`✅ Automation account closed: ${closeSig}`);
            logger.info('💰 SOL reclaimed to wallet. Bot will recreate automation on next cycle.');

            // Return false to stop deployment attempts - bot will recreate automation next round
            return false;
          } catch (closeError) {
            logger.error('❌ Failed to close automation account:', closeError);
            logger.warn('💡 Bot will continue trying. May need manual intervention.');
            return false;
          }
        }

        logger.info(`✅ Automation refund successful! Balance updated to ${updatedBalanceSol.toFixed(6)} SOL`);
        return true;
      } else {
        logger.info('[DRY RUN] Would transfer SOL to automation account');
        return true;
      }
    } else {
      logger.error('❌ Auto-swap failed');
      return false;
    }
  } catch (error) {
    logger.error('Auto-refund failed:', error);
    return false;
  }
}

/**
 * Auto-swap wrapper: Periodically check and refund automation account
 */
async function autoSwapCheck(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastSwapCheck < config.checkRewardsIntervalMs) {
      return;
    }
    lastSwapCheck = now;

    logger.debug('Checking automation balance for auto-swap...');
    const automationInfo = await getAutomationInfo();

    if (!automationInfo) {
      logger.debug('No automation account found, skipping swap check');
      return;
    }

    await autoRefundAutomation(automationInfo);
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
      logger.info(`ORB balance (${balances.orb.toFixed(2)}) >= stake threshold (${config.stakeOrbThreshold}), staking...`);

      const stakeAmount = orbAvailable;

      if (config.dryRun) {
        logger.info(`[DRY RUN] Would stake ${stakeAmount.toFixed(2)} ORB`);
        return;
      }

      const instruction = await buildStakeInstruction(stakeAmount);
      const signature = await sendAndConfirmTransaction([instruction], 'Auto-Stake');
      logger.info(`✅ Auto-stake successful: ${signature}`);
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
      logger.warn('⚠️  Automation balance depleted!');
      logger.warn(`Need: ${(automationInfo.costPerRound / 1e9).toFixed(4)} SOL`);
      logger.warn(`Have: ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);

      // Try to refund
      const refunded = await autoRefundAutomation(automationInfo);
      if (!refunded) {
        logger.error('❌ Cannot continue mining. Automation out of funds.');
        return false;
      }

      // Reload automation info after refund
      const updatedInfo = await getAutomationInfo();
      if (!updatedInfo || updatedInfo.balance < updatedInfo.costPerRound) {
        logger.warn('⚠️  Transfer complete but automation balance still low.');
        logger.warn('💡 The ORB program tracks balance internally - direct transfers may not work.');
        logger.warn('💡 Consider closing and recreating automation account with fresh funds.');
        logger.warn('💡 Or wait for more ORB rewards to accumulate and swap again.');
        return false;
      }
    }

    // Get current board state
    const board = await fetchBoard();
    const currentSlot = await getCurrentSlot();

    // Check if miner needs checkpointing BEFORE attempting deployment
    const wallet = getWallet();
    const miner = await fetchMiner(wallet.publicKey);

    logger.info(`🔍 Checking miner checkpoint status...`);
    logger.info(`Miner exists: ${!!miner}`);
    if (miner) {
      logger.info(`Miner checkpointId: ${miner.checkpointId.toString()}, Board roundId: ${board.roundId.toString()}`);
      logger.info(`Miner behind? ${miner.checkpointId.lt(board.roundId)}`);
    }

    if (miner && miner.checkpointId.lt(board.roundId)) {
      const roundsBehind = board.roundId.sub(miner.checkpointId).toNumber();
      logger.info(`⚠️  Miner checkpoint behind by ${roundsBehind} round(s)`);

      // Checkpoint in batches (max 10 per transaction due to compute limits)
      const maxCheckpointsPerTx = 10;
      let remaining = roundsBehind;
      let totalCheckpointed = 0;

      while (remaining > 0) {
        const batchSize = Math.min(remaining, maxCheckpointsPerTx);
        logger.info(`Sending ${batchSize} checkpoint(s) in one transaction...`);

        const { buildCheckpointInstruction } = await import('../utils/program');
        const checkpointInstructions: TransactionInstruction[] = [];

        for (let i = 0; i < batchSize; i++) {
          try {
            const checkpointIx = await buildCheckpointInstruction();
            checkpointInstructions.push(checkpointIx);
          } catch (buildError: any) {
            logger.debug(`Built ${i} checkpoint instructions`);
            break;
          }
        }

        if (checkpointInstructions.length === 0) {
          logger.error('Failed to build checkpoint instructions');
          break;
        }

        try {
          const checkpointSig = await sendAndConfirmTransaction(checkpointInstructions, 'Checkpoint');
          logger.info(`✅ Checkpointed ${checkpointInstructions.length} round(s): ${checkpointSig}`);
          totalCheckpointed += checkpointInstructions.length;
          remaining -= checkpointInstructions.length;
        } catch (error: any) {
          logger.error(`Failed to checkpoint: ${error.message || error}`);
          // If checkpoint fails, we can't deploy, so return false
          return false;
        }

        // Small delay between batches to avoid rate limiting
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`✅ Total checkpointed: ${totalCheckpointed} round(s)`);

      // Re-fetch board after checkpointing to get current round
      // (round may have advanced during checkpointing)
      const updatedBoard = await fetchBoard();
      logger.debug(`Board round after checkpointing: ${updatedBoard.roundId.toString()}`);

      // Update board reference for deployment
      Object.assign(board, updatedBoard);
    }

    // Check motherload threshold
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;

    if (motherloadOrb < config.motherloadThreshold) {
      logger.debug(`Motherload (${motherloadOrb.toFixed(2)}) below threshold (${config.motherloadThreshold}), waiting...`);
      return false;
    }

    // Production Cost Profitability Check
    if (config.enableProductionCostCheck) {
      const costPerRound = automationInfo.costPerRound / 1e9;
      const profitability = await isProfitableToMine(costPerRound, motherloadOrb);

      if (!profitability.profitable) {
        logger.info(`\n${'='.repeat(60)}`);
        logger.info('❌ UNPROFITABLE MINING CONDITIONS');
        logger.info('='.repeat(60));
        logger.info(`Motherload: ${motherloadOrb.toFixed(2)} ORB`);
        logger.info(`ORB Price: ${profitability.orbPrice.toFixed(6)} SOL`);
        logger.info('\nProduction Cost Analysis:');
        logger.info(`  ${profitability.breakdownMessage.split('\n').join('\n  ')}`);
        logger.info('='.repeat(60));
        logger.info('💡 Skipping this round - waiting for better conditions');
        logger.info('='.repeat(60));
        return false;
      } else {
        // Log profitability info at debug level
        logger.debug(`\nProduction Cost Analysis (Profitable):`);
        logger.debug(`  ${profitability.breakdownMessage.split('\n').join('\n  ')}`);
      }
    }

    // Check if round is still active
    if (new BN(currentSlot).gte(board.endSlot)) {
      logger.debug('Round has ended, waiting for new round...');
      return false;
    }

    // Execute deployment
    const solPerRound = automationInfo.costPerRound / 1e9;
    const solPerSquare = automationInfo.amountPerSquare / 1e9;

    logger.info(`Deploying ${solPerRound.toFixed(4)} SOL to ${automationInfo.mask} squares (${solPerSquare.toFixed(6)} SOL/square)...`);
    logger.info(`Remaining balance: ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);

    if (config.dryRun) {
      logger.info('[DRY RUN] Would execute automation deployment');
      return true;
    }

    // Build execute automation instruction (discriminator 0x06)
    const instruction = await buildExecuteAutomationInstruction();
    const signature = await sendAndConfirmTransaction([instruction], 'Auto-Mine');

    logger.info(`✅ Deployment successful: ${signature}`);
    logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${signature}`);

    return true;
  } catch (error) {
    const errorMsg = String(error);

    // Handle checkpoint required error
    if (errorMsg.includes('not checkpointed') || errorMsg.includes('checkpoint')) {
      logger.info('⚠️  Miner needs checkpointing. Catching up on previous rounds...');

      try {
        const { buildCheckpointInstruction } = await import('../utils/program');

        // Build all checkpoint instructions (max 10 rounds) and send in ONE transaction
        const maxCheckpoints = 10;
        const checkpointInstructions: TransactionInstruction[] = [];

        for (let i = 0; i < maxCheckpoints; i++) {
          try {
            const checkpointIx = await buildCheckpointInstruction();
            checkpointInstructions.push(checkpointIx);
          } catch (buildError: any) {
            // Stop building if we can't create more checkpoint instructions
            logger.debug(`Built ${i} checkpoint instructions, stopping`);
            break;
          }
        }

        if (checkpointInstructions.length === 0) {
          logger.warn('No checkpoint instructions to send');
          return false;
        }

        // Send all checkpoints in ONE transaction
        logger.info(`Sending ${checkpointInstructions.length} checkpoint(s) in one transaction...`);
        const signature = await sendAndConfirmTransaction(checkpointInstructions, 'Checkpoint');
        logger.info(`✅ Checkpointed ${checkpointInstructions.length} round(s): ${signature}`);

        // Retry deployment after successful checkpoint
        if (!config.dryRun) {
          const instruction = await buildExecuteAutomationInstruction();
          const deploySig = await sendAndConfirmTransaction([instruction], 'Auto-Mine');

          const solPerRound = automationInfo.costPerRound / 1e9;
          logger.info(`✅ Deployment successful: ${deploySig}`);
          logger.info(`[TRANSACTION] Auto-Mine | ${solPerRound.toFixed(4)} SOL | ${deploySig}`);
          return true;
        }

        return true;
      } catch (checkpointError) {
        logger.error('Failed to checkpoint:', checkpointError);
        return false;
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

    logger.info('='.repeat(60));
    logger.info('🤖 SMART AUTONOMOUS ORB MINING BOT');
    logger.info('='.repeat(60));
    logger.info('Fully automated mining with intelligent management');
    logger.info('Press Ctrl+C to stop');
    logger.info('='.repeat(60));

    // Step 1: Check/Setup automation account
    let automationInfo = await getAutomationInfo();

    if (!automationInfo) {
      logger.info('No automation account found. Setting up...');
      const setupSuccess = await autoSetupAutomation();

      if (!setupSuccess) {
        logger.error('Failed to setup automation. Exiting.');
        return;
      }

      // Wait for account propagation and reload automation info
      logger.info('Waiting for automation account to propagate...');
      await sleep(2000);

      // Retry loading automation info up to 5 times
      let retries = 0;
      while (!automationInfo && retries < 5) {
        automationInfo = await getAutomationInfo();
        if (!automationInfo) {
          retries++;
          logger.debug(`Retry ${retries}/5: Waiting for automation account...`);
          await sleep(1000);
        }
      }

      if (!automationInfo) {
        logger.error('Failed to load automation info after setup. Exiting.');
        return;
      }

      const balance = automationInfo.balance / 1e9;
      const solPerRound = automationInfo.costPerRound / 1e9;
      const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

      logger.info(`✅ Automation loaded successfully`);
      logger.info(`Balance: ${balance.toFixed(6)} SOL`);
      logger.info(`Cost per round: ${solPerRound.toFixed(4)} SOL`);
      logger.info(`Estimated rounds: ~${estimatedRounds}`);
    } else {
      logger.info('✅ Automation account found');
      const balance = automationInfo.balance / 1e9;
      const solPerRound = automationInfo.costPerRound / 1e9;
      const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

      logger.info(`Balance: ${balance.toFixed(6)} SOL`);
      logger.info(`Cost per round: ${solPerRound.toFixed(4)} SOL`);
      logger.info(`Estimated rounds: ~${estimatedRounds}`);
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('Configuration:');
    logger.info(`  Motherload threshold: ${config.motherloadThreshold} ORB`);
    logger.info(`  Auto-claim SOL: ${config.autoClaimSolThreshold} SOL`);
    logger.info(`  Auto-claim ORB: ${config.autoClaimOrbThreshold} ORB`);
    logger.info(`  Auto-swap: ${config.autoSwapEnabled ? 'Enabled' : 'Disabled'}`);
    logger.info(`  Auto-stake: ${config.autoStakeEnabled ? 'Enabled' : 'Disabled'}`);
    logger.info('='.repeat(60));

    // Step 2: Main autonomous loop
    let lastRoundId = '';
    let deployedRounds = 0;

    while (isRunning) {
      try {
        // Auto-claim rewards periodically
        await autoClaimRewards();

        // Auto-stake excess ORB periodically
        await autoStakeOrb();

        // Auto-swap to refund automation periodically
        await autoSwapCheck();

        // Get current round
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          logger.info(`\n${'='.repeat(60)}`);
          logger.info(`📍 New Round: ${currentRoundId}`);
          logger.info('='.repeat(60));
          lastRoundId = currentRoundId;

          // Check motherload for dynamic scaling
          const treasury = await fetchTreasury();
          const currentMotherload = Number(treasury.motherlode) / 1e9;
          logger.debug(`Current motherload: ${currentMotherload.toFixed(2)} ORB (setup: ${setupMotherload.toFixed(2)} ORB)`);

          // Check if we should restart automation based on motherload changes
          if (await shouldRestartAutomation(currentMotherload)) {
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

          // Reload automation info for current state
          automationInfo = await getAutomationInfo();
          if (!automationInfo) {
            logger.warn('⚠️  Automation account not found. Recreating...');
            const setupSuccess = await autoSetupAutomation();

            if (!setupSuccess) {
              logger.error('Failed to recreate automation. Exiting.');
              break;
            }

            // Wait for account propagation
            logger.info('Waiting for new automation account to propagate...');
            await sleep(2000);

            // Reload automation info
            automationInfo = await getAutomationInfo();
            if (!automationInfo) {
              logger.error('Failed to load recreated automation info. Exiting.');
              break;
            }

            const balance = automationInfo.balance / 1e9;
            const solPerRound = automationInfo.costPerRound / 1e9;
            const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

            logger.info(`✅ Automation recreated successfully`);
            logger.info(`Balance: ${balance.toFixed(6)} SOL`);
            logger.info(`Cost per round: ${solPerRound.toFixed(4)} SOL`);
            logger.info(`Estimated rounds: ~${estimatedRounds}`);
          }

          // Auto-mine the new round
          const deployed = await autoMineRound(automationInfo);

          if (deployed) {
            deployedRounds++;
            logger.info(`Total deployments: ${deployedRounds}`);

            // Check remaining balance
            const updatedInfo = await getAutomationInfo();
            if (updatedInfo) {
              const remainingRounds = Math.floor(updatedInfo.balance / updatedInfo.costPerRound);
              if (remainingRounds < 5 && remainingRounds > 0) {
                logger.warn(`⚠️  WARNING: Only ~${remainingRounds} rounds remaining!`);
              } else if (remainingRounds === 0) {
                logger.info('Automation depleted. Attempting refund...');
                const refunded = await autoRefundAutomation(updatedInfo);
                if (!refunded) {
                  logger.info('Cannot refund. Stopping bot.');
                  break;
                }
              }
            }
          }
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

    logger.info('\n' + '='.repeat(60));
    logger.info('🤖 Smart Bot Stopped');
    logger.info(`Total rounds deployed: ${deployedRounds}`);
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('Smart bot failed:', error);
    throw error;
  }
}
