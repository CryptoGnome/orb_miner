import { getWallet, getBalances, getSolBalance } from '../utils/wallet';
import { fetchBoard, fetchMiner, fetchTreasury } from '../utils/accounts';
import { buildDeployInstruction, sendAndConfirmTransaction } from '../utils/program';
import { buildClaimSolInstruction, buildClaimOreInstruction } from '../utils/program';
import { swapOrbToSol } from '../utils/jupiter';
import { getCurrentSlot } from '../utils/solana';
import { config } from '../utils/config';
import { sleep } from '../utils/retry';
import logger from '../utils/logger';
import { TransactionInstruction } from '@solana/web3.js';

let isRunning = true;
let lastRewardsCheck = 0;
let signalHandlersRegistered = false;

// Setup graceful shutdown handlers (only once)
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

async function checkAndClaimRewards(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastRewardsCheck < config.checkRewardsIntervalMs) {
      return; // Not time to check yet
    }

    lastRewardsCheck = now;

    if (!config.autoClaimEnabled) {
      return;
    }

    logger.info('Checking rewards for auto-claim...');
    const wallet = getWallet();
    const instructions: TransactionInstruction[] = [];

    // Check mining rewards
    if (config.claimFromMining) {
      const miner = await fetchMiner(wallet.publicKey);
      if (miner) {
        const miningSol = Number(miner.rewardsSol) / 1e9;
        const miningOrb = Number(miner.rewardsOre) / 1e9;

        // Check if we should claim SOL
        if ((config.claimType === 'sol' || config.claimType === 'both') &&
            miningSol >= config.claimThresholdSol) {
          logger.info(`Mining SOL rewards (${miningSol.toFixed(4)}) above threshold (${config.claimThresholdSol}), claiming...`);
          instructions.push(buildClaimSolInstruction());
        }

        // Check if we should claim ORB
        if ((config.claimType === 'orb' || config.claimType === 'both') &&
            miningOrb >= config.claimThresholdOrb) {
          logger.info(`Mining ORB rewards (${miningOrb.toFixed(2)}) above threshold (${config.claimThresholdOrb}), claiming...`);
          instructions.push(await buildClaimOreInstruction());
        }
      }
    }

    if (instructions.length > 0 && !config.dryRun) {
      const { signature, fee: actualFee } = await sendAndConfirmTransaction(instructions, 'Auto-Claim');
      logger.info(`Auto-claim successful: ${signature} (fee: ${actualFee.toFixed(6)} SOL)`);
    }
  } catch (error) {
    logger.error('Auto-claim failed:', error);
  }
}

async function ensureSufficientSol(): Promise<boolean> {
  try {
    const balances = await getBalances();

    // Check if SOL is sufficient
    if (balances.sol >= config.minSolForDeployment) {
      return true;
    }

    logger.warn(`SOL balance (${balances.sol.toFixed(4)}) is below minimum (${config.minSolForDeployment})`);

    // Try auto-swap if enabled
    if (config.enableJupiterSwap && config.autoSwapWhenLowSol) {
      logger.info('Attempting auto-swap ORB to SOL...');

      // Check if we have enough ORB to swap
      const orbAvailable = balances.orb - config.minOrbToKeep;
      if (orbAvailable >= config.swapOrbAmount) {
        logger.info(`Swapping ${config.swapOrbAmount} ORB to SOL...`);
        const result = await swapOrbToSol(config.swapOrbAmount, config.slippageBps);

        if (result.success) {
          logger.info(`Auto-swap successful! Received ${result.solReceived?.toFixed(4)} SOL`);

          // Check if we now have enough SOL
          const newSolBalance = await getSolBalance();
          if (newSolBalance >= config.minSolForDeployment) {
            return true;
          } else {
            logger.warn(`Still insufficient SOL after swap (${newSolBalance.toFixed(4)} SOL)`);
          }
        } else {
          logger.error('Auto-swap failed');
        }
      } else {
        logger.warn(`Insufficient ORB for auto-swap (have ${orbAvailable.toFixed(2)}, need ${config.swapOrbAmount})`);
      }
    }

    // If we're here, we don't have enough SOL
    if (config.pauseIfLowSol) {
      logger.warn('⚠️  LOW SOL BALANCE - PAUSED ⚠️');
      logger.warn(`Please add more SOL to your wallet: ${getWallet().publicKey.toBase58()}`);
      logger.warn(`Current: ${balances.sol.toFixed(4)} SOL, Need: ${config.minSolForDeployment} SOL`);
      return false;
    }

    return false;
  } catch (error) {
    logger.error('Error ensuring sufficient SOL:', error);
    return false;
  }
}

async function deployToRound(): Promise<boolean> {
  try {
    // Check SOL balance and auto-swap if needed
    const hasSufficientSol = await ensureSufficientSol();
    if (!hasSufficientSol) {
      return false; // Paused, waiting for SOL
    }

    // Fetch current board
    const board = await fetchBoard();
    logger.info(`Current Round: ${board.roundId.toString()}`);

    // Fetch global motherload from Treasury
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9;
    logger.info(`Global Motherload: ${motherloadOrb.toFixed(2)} ORB`);

    // Check motherload threshold
    if (motherloadOrb < config.motherloadThreshold) {
      logger.warn(`Motherload (${motherloadOrb.toFixed(2)}) below threshold (${config.motherloadThreshold}), skipping deployment`);
      return false;
    }

    // Check if round is still active
    const currentSlot = await getCurrentSlot();
    if (currentSlot >= board.endSlot.toNumber()) {
      logger.info('Round has ended, waiting for new round...');
      return false;
    }

    // Deploy to all 25 squares
    logger.info(`Deploying ${config.solPerDeployment} SOL to all 25 squares...`);

    if (config.dryRun) {
      logger.info('[DRY RUN] Would deploy here');
      return true;
    }

    const deployIx = await buildDeployInstruction(config.solPerDeployment);
    const { signature, fee: actualFee } = await sendAndConfirmTransaction([deployIx], 'Auto-Deploy');

    logger.info(`✅ Deployment successful: ${signature}`);
    logger.info(`[TRANSACTION] Auto-Deploy | ${config.solPerDeployment} SOL | Fee: ${actualFee.toFixed(6)} SOL | ${signature}`);

    return true;
  } catch (error) {
    logger.error('Deployment failed:', error);
    return false;
  }
}

export async function autoDeployCommand(): Promise<void> {
  try {
    // Setup signal handlers for graceful shutdown
    setupSignalHandlers();

    logger.info('='.repeat(60));
    logger.info('Starting Auto-Deploy Bot');
    logger.info('='.repeat(60));
    logger.info(`Motherload Threshold: ${config.motherloadThreshold} ORB`);
    logger.info(`SOL per deployment: ${config.solPerDeployment} SOL`);
    logger.info(`Min SOL for deployment: ${config.minSolForDeployment} SOL`);
    logger.info(`Auto-claim: ${config.autoClaimEnabled ? 'Enabled' : 'Disabled'}`);
    logger.info(`Auto-swap: ${config.autoSwapWhenLowSol ? 'Enabled' : 'Disabled'}`);
    logger.info(`Iterations: ${config.autoDeployIterations === 0 ? 'Infinite' : config.autoDeployIterations}`);
    logger.info('Press Ctrl+C to stop');
    logger.info('='.repeat(60));

    let iteration = 0;
    let lastRoundId = '';

    while (isRunning) {
      try {
        // Check iteration limit
        if (config.autoDeployIterations > 0 && iteration >= config.autoDeployIterations) {
          logger.info(`Reached iteration limit (${config.autoDeployIterations}), stopping...`);
          break;
        }

        // Check and claim rewards periodically
        await checkAndClaimRewards();

        // Get current round
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          logger.info(`\n${'='.repeat(60)}`);
          logger.info(`New Round Detected: ${currentRoundId}`);
          logger.info('='.repeat(60));
          lastRoundId = currentRoundId;

          // Deploy to the new round
          const deployed = await deployToRound();

          if (deployed) {
            iteration++;
            logger.info(`Deployments completed: ${iteration}${config.autoDeployIterations > 0 ? `/${config.autoDeployIterations}` : ''}`);
          }
        }

        // Wait before checking again
        await sleep(config.checkRoundIntervalMs);

        // If we're in smart round management mode, wait for round to end
        if (config.smartRoundManagement) {
          const currentSlot = await getCurrentSlot();
          if (currentSlot < board.endSlot.toNumber()) {
            const slotsRemaining = board.endSlot.toNumber() - currentSlot;
            logger.debug(`Round in progress, ${slotsRemaining} slots remaining...`);
          }
        }

        // Rate limiting
        if (config.rateLimitMs > 0) {
          await sleep(config.rateLimitMs);
        }
      } catch (error) {
        logger.error('Error in auto-deploy loop:', error);
        await sleep(5000); // Wait 5 seconds before retrying
      }
    }

    logger.info('\n='.repeat(60));
    logger.info('Auto-Deploy Bot Stopped');
    logger.info('='.repeat(60));
  } catch (error) {
    logger.error('Auto-deploy command failed:', error);
    throw error;
  }
}
