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
    // Base reward: 4 ORB per round (split proportionally)
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
    const closeInstruction = buildCloseAutomationInstruction();
    const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation for Scaling');
    logger.debug(`Automation closed: ${closeSig}`);

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

    ui.info(`Wallet ORB balance: ${balances.orb.toFixed(2)} ORB - selling...`);

    // Calculate how much ORB to swap
    const orbToSwap = Math.max(0, balances.orb - config.minOrbToKeep);

    if (orbToSwap < config.minOrbSwapAmount) {
      logger.debug(`Not enough ORB to swap (have ${balances.orb.toFixed(2)}, need ${config.minOrbSwapAmount})`);
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

    // Swap ORB to SOL
    ui.swap(`Swapping ${orbToSwap.toFixed(2)} ORB to SOL...`);

    const result = await swapOrbToSol(orbToSwap, config.slippageBps);

    if (result.success && result.solReceived) {
      ui.success(`Received ${result.solReceived.toFixed(4)} SOL (kept in wallet for future restarts)`);
    } else {
      logger.error('❌ Auto-swap failed');
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
      ui.warning('Budget depleted - closing automation account...');
      logger.debug(`Need: ${(automationInfo.costPerRound / 1e9).toFixed(4)} SOL, Have: ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);

      // Close automation account to reclaim remaining SOL
      try {
        const closeInstruction = buildCloseAutomationInstruction();
        const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
        logger.debug(`Automation account closed: ${closeSig}`);
        ui.success('SOL reclaimed to wallet - will recreate automation on next cycle');
      } catch (closeError) {
        logger.error('Failed to close automation account:', closeError);
      }

      return false; // Signal that automation needs to be recreated
    }

    // Get current board state
    const board = await fetchBoard();
    const currentSlot = await getCurrentSlot();

    // Check if miner needs checkpointing BEFORE attempting deployment
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
      ui.info(`Catching up ${roundsBehind} missed round(s)...`);

      // Checkpoint in batches (max 10 per transaction due to compute limits)
      const maxCheckpointsPerTx = 10;
      let remaining = roundsBehind;
      let totalCheckpointed = 0;

      while (remaining > 0) {
        const batchSize = Math.min(remaining, maxCheckpointsPerTx);
        logger.debug(`Sending ${batchSize} checkpoint(s)...`);

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
          logger.debug(`Checkpointed ${checkpointInstructions.length} round(s): ${checkpointSig}`);
          totalCheckpointed += checkpointInstructions.length;
          remaining -= checkpointInstructions.length;
        } catch (error: any) {
          logger.error(`Failed to checkpoint: ${error.message || error}`);
          return false;
        }

        // Small delay between batches to avoid rate limiting
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      ui.success(`Caught up ${totalCheckpointed} round(s)`);

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

    return true;
  } catch (error) {
    const errorMsg = String(error);

    // Handle checkpoint required error
    if (errorMsg.includes('not checkpointed') || errorMsg.includes('checkpoint')) {
      ui.info('Catching up on previous rounds...');

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
        logger.debug(`Sending ${checkpointInstructions.length} checkpoint(s)...`);
        const signature = await sendAndConfirmTransaction(checkpointInstructions, 'Checkpoint');
        ui.success(`Caught up ${checkpointInstructions.length} round(s)`);
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

    ui.header('🤖 ORB MINING BOT - AUTONOMOUS MODE');
    ui.info('Fully automated mining • Press Ctrl+C to stop');
    ui.blank();

    // Step 1: Check/Setup automation account
    let automationInfo = await getAutomationInfo();

    if (!automationInfo) {
      ui.section('INITIAL SETUP');
      ui.info('Creating automation account...');
      const setupSuccess = await autoSetupAutomation();

      if (!setupSuccess) {
        logger.error('Failed to setup automation. Exiting.');
        return;
      }

      // Wait for account propagation and reload automation info
      logger.debug('Waiting for automation account to propagate...');
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

      ui.success(`Automation ready`);
      ui.status('Budget', `${balance.toFixed(4)} SOL (~${estimatedRounds} rounds)`);
      ui.status('Per Round', `${solPerRound.toFixed(4)} SOL`);
    } else {
      ui.success('Automation account found');
      const balance = automationInfo.balance / 1e9;
      const solPerRound = automationInfo.costPerRound / 1e9;
      const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

      ui.status('Budget', `${balance.toFixed(4)} SOL (~${estimatedRounds} rounds)`);
      ui.status('Per Round', `${solPerRound.toFixed(4)} SOL`);
    }

    ui.blank();
    ui.section('BOT CONFIGURATION');
    ui.status('Motherload Threshold', `${config.motherloadThreshold} ORB`);
    ui.status('Auto-Claim SOL', `${config.autoClaimSolThreshold} SOL`);
    ui.status('Auto-Claim ORB', `${config.autoClaimOrbThreshold} ORB`);
    ui.status('Auto-Swap', config.autoSwapEnabled ? 'Enabled' : 'Disabled');
    ui.status('Auto-Stake', config.autoStakeEnabled ? 'Enabled' : 'Disabled');
    ui.blank();
    ui.info('Bot is now running... Monitoring for new rounds');
    ui.blank();

    // Step 2: Main autonomous loop
    let lastRoundId = '';
    let deployedRounds = 0;

    while (isRunning) {
      try {
        // Auto-claim rewards periodically
        await autoClaimRewards();

        // Auto-stake excess ORB periodically
        await autoStakeOrb();

        // Auto-sell ORB when balance is high (periodic check)
        await autoSwapCheck();

        // Get current round
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          ui.section(`ROUND ${currentRoundId}`);
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
            logger.debug('Waiting for new automation account to propagate...');
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

            ui.success('Automation recreated');
            ui.status('Budget', `${balance.toFixed(4)} SOL (~${estimatedRounds} rounds)`);
            ui.status('Per Round', `${solPerRound.toFixed(4)} SOL`);
          }

          // Auto-mine the new round
          const deployed = await autoMineRound(automationInfo);

          if (deployed) {
            deployedRounds++;
            ui.info(`Total rounds mined: ${deployedRounds}`);

            // Check remaining balance
            const updatedInfo = await getAutomationInfo();
            if (updatedInfo) {
              const remainingRounds = Math.floor(updatedInfo.balance / updatedInfo.costPerRound);
              const remainingBalance = updatedInfo.balance / 1e9;
              ui.status('Remaining Budget', `${remainingBalance.toFixed(4)} SOL (~${remainingRounds} rounds)`);

              if (remainingRounds < 5 && remainingRounds > 0) {
                ui.warning(`Only ${remainingRounds} rounds remaining!`);
              } else if (remainingRounds === 0) {
                ui.warning('Budget depleted - closing automation account...');
                try {
                  const closeInstruction = buildCloseAutomationInstruction();
                  const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
                  logger.debug(`Automation account closed: ${closeSig}`);
                  ui.success('SOL reclaimed - will recreate automation on next round');
                } catch (closeError) {
                  logger.error('Failed to close automation account:', closeError);
                }
                // Continue to next iteration - bot will recreate automation
              }
            }
            ui.blank();
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

    ui.blank();
    ui.header('BOT STOPPED');
    ui.info(`Total rounds mined: ${deployedRounds}`);
    ui.blank();

  } catch (error) {
    logger.error('Smart bot failed:', error);
    throw error;
  }
}
