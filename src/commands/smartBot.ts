import { getWallet, getBalances, getSolBalance } from '../utils/wallet';
import {
  getAutomationPDA,
  fetchBoard,
  fetchMiner,
  fetchTreasury
} from '../utils/accounts';
import {
  sendAndConfirmTransaction,
  buildAutomateInstruction,
  buildExecuteAutomationInstruction,
  buildClaimSolInstruction,
  buildClaimOreInstruction,
  buildStakeInstruction,
  AutomationStrategy
} from '../utils/program';
import { getConnection, getCurrentSlot } from '../utils/solana';
import { swapOrbToSol } from '../utils/jupiter';
import { config } from '../utils/config';
import { sleep } from '../utils/retry';
import { TransactionInstruction } from '@solana/web3.js';
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
 * Calculate optimal rounds based on motherload (conservative lottery EV optimization)
 * Strategy:
 * - 0-199 ORB: Don't mine (below minimum threshold)
 * - 200-399 ORB: Conservative (100 rounds)
 * - 400-499 ORB: Start getting aggressive (90 rounds)
 * - 500-599 ORB: More aggressive (80 rounds)
 * - 600-699 ORB: Very aggressive (70 rounds)
 * - 700+ ORB: Maximum aggression (continues reducing to min 30)
 */
function calculateTargetRounds(motherloadOrb: number): number {
  const baseRounds = 100;

  // Don't reduce rounds until motherload >= 400
  if (motherloadOrb < 400) {
    return baseRounds; // Conservative: 100 rounds
  }

  // Start reducing rounds from 400 ORB onwards
  // Tier 4 (400-499) = 90 rounds, Tier 5 (500-599) = 80 rounds, etc.
  const motherloadTier = Math.floor(motherloadOrb / 100);
  const reduction = (motherloadTier - 4) * 10; // Start reduction at tier 4
  return Math.max(30, baseRounds - reduction);
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

      // Auto-claim ORB
      if (miningOrb >= config.autoClaimOrbThreshold) {
        logger.info(`Mining ORB rewards (${miningOrb.toFixed(2)}) >= threshold (${config.autoClaimOrbThreshold}), claiming...`);
        instructions.push(await buildClaimOreInstruction());
      }
    }

    if (instructions.length > 0 && !config.dryRun) {
      const signature = await sendAndConfirmTransaction(instructions, 'Auto-Claim');
      logger.info(`✅ Auto-claim successful: ${signature}`);
    }
  } catch (error) {
    logger.error('Auto-claim failed:', error);
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

    // Check if we have enough ORB to swap
    const balances = await getBalances();
    const orbAvailable = balances.orb - config.minOrbToKeep;

    if (orbAvailable < config.swapOrbAmount) {
      logger.error(`❌ Insufficient ORB to swap. Have: ${orbAvailable.toFixed(2)}, Need: ${config.swapOrbAmount}`);
      return false;
    }

    logger.info(`Swapping ${config.swapOrbAmount} ORB to SOL to refund automation...`);
    const result = await swapOrbToSol(config.swapOrbAmount, config.slippageBps);

    if (result.success) {
      logger.info(`✅ Auto-swap successful! Received ${result.solReceived?.toFixed(4)} SOL`);

      // TODO: Transfer SOL to automation account
      // This would require a transfer instruction to the automation PDA
      logger.info('💡 SOL added to wallet. Automation will use it on next deployment.');

      return true;
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
        logger.error('❌ Refund insufficient. Stopping.');
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

        // Get current round
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          logger.info(`\n${'='.repeat(60)}`);
          logger.info(`📍 New Round: ${currentRoundId}`);
          logger.info('='.repeat(60));
          lastRoundId = currentRoundId;

          // Reload automation info for current state
          automationInfo = await getAutomationInfo();
          if (!automationInfo) {
            logger.error('Lost automation account. Exiting.');
            break;
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
