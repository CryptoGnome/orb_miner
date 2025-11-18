import { getWallet } from '../src/utils/wallet';
import { getAutomationPDA, getMinerPDA, getBoardPDA, getRoundPDA, fetchBoard } from '../src/utils/accounts';
import { sendAndConfirmTransaction } from '../src/utils/program';
import { getConnection, getCurrentSlot } from '../src/utils/solana';
import { config } from '../src/utils/config';
import { sleep } from '../src/utils/retry';
import { TransactionInstruction, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import logger from '../src/utils/logger';

/**
 * Continuous automation execution loop
 *
 * This script continuously monitors for new rounds and automatically
 * executes deployments using the automation account.
 *
 * Similar to autoDeploy.ts but uses the automation account instead of wallet funds.
 *
 * Run with: npx ts-node tests/test-run-automation-loop.ts
 */

// Deploy discriminator (same as manual deploy)
const DEPLOY_DISCRIMINATOR = Buffer.from([0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00]);

let isRunning = true;
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

async function buildExecuteAutomationInstruction(): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);
  const [boardPDA] = getBoardPDA();

  // Get current round
  const board = await fetchBoard();
  const [roundPDA] = getRoundPDA(board.roundId);

  // Build deploy instruction data (34 bytes total)
  // When automation account is present, amount is taken from automation config
  const data = Buffer.alloc(34);
  DEPLOY_DISCRIMINATOR.copy(data, 0);                   // Discriminator (8 bytes)
  new BN(0).toArrayLike(Buffer, 'le', 8).copy(data, 8); // Amount (ignored when automation exists)
  data.writeUInt32LE(0, 16);                            // Squares mask - MUST BE 0
  data.writeUInt32LE(0, 20);                            // Unknown field
  data.writeUInt32LE(25, 24);                           // Square count

  // Account keys (based on deploy.rs)
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer (executor)
    { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // authority
    { pubkey: automationPDA, isSigner: false, isWritable: true },    // automation
    { pubkey: boardPDA, isSigner: false, isWritable: true },         // board
    { pubkey: minerPDA, isSigner: false, isWritable: true },         // miner
    { pubkey: roundPDA, isSigner: false, isWritable: true },         // round
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

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
    amountPerSquare: Number(amountPerSquare),
    balance: Number(balance),
    mask: Number(mask),
    costPerRound: Number(amountPerSquare) * Number(mask),
  };
}

async function executeAutomationForRound(): Promise<boolean> {
  try {
    // Check automation account status
    const automationInfo = await getAutomationInfo();
    if (!automationInfo) {
      logger.error('❌ Automation account not found or invalid');
      return false;
    }

    // Check if we have enough balance for this round
    if (automationInfo.balance < automationInfo.costPerRound) {
      logger.warn('⚠️  Automation balance depleted!');
      logger.warn(`Need: ${(automationInfo.costPerRound / 1e9).toFixed(4)} SOL`);
      logger.warn(`Have: ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);
      logger.info('Automation has run out of funds. Please fund the account to continue.');
      return false;
    }

    // Get current board state
    const board = await fetchBoard();
    const currentSlot = await getCurrentSlot();

    // Check if round is still active
    if (currentSlot >= board.endSlot.toNumber()) {
      logger.debug('Round has ended, waiting for new round...');
      return false;
    }

    // Log deployment info
    const solPerRound = automationInfo.costPerRound / 1e9;
    const solPerSquare = automationInfo.amountPerSquare / 1e9;
    logger.info(`Deploying ${solPerRound.toFixed(4)} SOL to ${automationInfo.mask} squares (${solPerSquare.toFixed(6)} SOL/square)...`);
    logger.info(`Remaining balance: ${(automationInfo.balance / 1e9).toFixed(6)} SOL`);

    // Dry run check
    if (config.dryRun) {
      logger.info('[DRY RUN] Would execute automation deployment');
      return true;
    }

    // Build and send transaction
    const instruction = await buildExecuteAutomationInstruction();
    const signature = await sendAndConfirmTransaction([instruction], 'Execute Automation');

    logger.info(`✅ Automation executed successfully: ${signature}`);
    logger.info(`[TRANSACTION] Automation Deploy | ${solPerRound.toFixed(4)} SOL | ${signature}`);

    return true;
  } catch (error) {
    logger.error('Automation execution failed:', error);

    // Check if error message indicates we already deployed
    const errorMsg = String(error);
    if (errorMsg.includes('already') || errorMsg.includes('duplicate')) {
      logger.warn('Already deployed for this round, waiting for next round...');
      return false;
    }

    return false;
  }
}

async function main() {
  try {
    setupSignalHandlers();

    logger.info('='.repeat(60));
    logger.info('Automation Execution Loop');
    logger.info('='.repeat(60));

    const wallet = getWallet();
    const connection = getConnection();
    const [automationPDA] = getAutomationPDA(wallet.publicKey);

    logger.info(`Executor: ${wallet.publicKey.toBase58()}`);
    logger.info(`Automation PDA: ${automationPDA.toBase58()}\n`);

    // Check if automation account exists
    logger.info('Checking automation account...');
    const accountInfo = await connection.getAccountInfo(automationPDA);

    if (!accountInfo) {
      logger.error('❌ No automation account found');
      logger.error('Please setup automation first with: npx ts-node tests/test-setup-smart-automation.ts\n');
      process.exit(1);
    }

    logger.info('✅ Automation account exists\n');

    // Display initial configuration
    const automationInfo = await getAutomationInfo();
    if (automationInfo) {
      const solPerSquare = automationInfo.amountPerSquare / 1e9;
      const solPerRound = automationInfo.costPerRound / 1e9;
      const balance = automationInfo.balance / 1e9;
      const estimatedRounds = Math.floor(automationInfo.balance / automationInfo.costPerRound);

      logger.info('Automation Configuration:');
      logger.info(`  Amount per square: ${solPerSquare.toFixed(6)} SOL`);
      logger.info(`  SOL per round: ${solPerRound.toFixed(4)} SOL`);
      logger.info(`  Squares: ${automationInfo.mask}`);
      logger.info(`  Remaining balance: ${balance.toFixed(6)} SOL`);
      logger.info(`  Estimated rounds: ~${estimatedRounds} rounds`);
      logger.info('');
    }

    logger.info('Starting continuous automation loop...');
    logger.info('Press Ctrl+C to stop\n');
    logger.info('='.repeat(60));

    let lastRoundId = '';
    let deployedRounds = 0;

    while (isRunning) {
      try {
        // Get current board state
        const board = await fetchBoard();
        const currentRoundId = board.roundId.toString();

        // Check if this is a new round
        if (currentRoundId !== lastRoundId) {
          logger.info(`\n${'='.repeat(60)}`);
          logger.info(`New Round Detected: ${currentRoundId}`);
          logger.info('='.repeat(60));
          lastRoundId = currentRoundId;

          // Execute automation for the new round
          const deployed = await executeAutomationForRound();

          if (deployed) {
            deployedRounds++;
            logger.info(`Rounds deployed: ${deployedRounds}`);

            // Check remaining balance
            const updatedInfo = await getAutomationInfo();
            if (updatedInfo) {
              const remainingRounds = Math.floor(updatedInfo.balance / updatedInfo.costPerRound);
              if (remainingRounds < 5) {
                logger.warn(`⚠️  WARNING: Only ~${remainingRounds} rounds remaining!`);
              }
            }
          } else {
            // Check if we're out of funds
            const info = await getAutomationInfo();
            if (info && info.balance < info.costPerRound) {
              logger.info('\n='.repeat(60));
              logger.info('Automation depleted - stopping loop');
              logger.info('='.repeat(60));
              break;
            }
          }
        }

        // Wait before checking again (default 10 seconds)
        const checkInterval = config.checkRoundIntervalMs || 10000;
        await sleep(checkInterval);

      } catch (error) {
        logger.error('Error in automation loop:', error);
        await sleep(5000); // Wait 5 seconds before retrying
      }
    }

    logger.info('\n='.repeat(60));
    logger.info('Automation Loop Stopped');
    logger.info(`Total rounds deployed: ${deployedRounds}`);
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('\n❌ Automation loop failed:', error);
    process.exit(1);
  }
}

main();
