import { getSolBalance } from '../utils/wallet';
import { buildDeployInstruction, getSquareMask, sendAndConfirmTransaction } from '../utils/program';
import { fetchBoard, fetchRound } from '../utils/accounts';
import { config } from '../utils/config';
import logger from '../utils/logger';

export async function deployCommand(): Promise<void> {
  try {
    logger.info('Starting deployment...');

    // Check SOL balance
    const solBalance = await getSolBalance();
    logger.info(`Current SOL balance: ${solBalance.toFixed(4)} SOL`);

    if (solBalance < config.solPerDeployment) {
      throw new Error(`Insufficient SOL balance. Need ${config.solPerDeployment} SOL, have ${solBalance.toFixed(4)} SOL`);
    }

    if (solBalance < config.minSolBalance) {
      logger.warn(`SOL balance is below minimum threshold (${config.minSolBalance} SOL)`);
    }

    // Fetch board to get current round
    const board = await fetchBoard();
    logger.info(`Deploying for Round ${board.roundId.toString()}`);

    // Fetch round to check motherload
    const round = await fetchRound(board.roundId);
    const motherloadOrb = Number(round.motherload) / 1e9;
    logger.info(`Current Motherload: ${motherloadOrb.toFixed(2)} ORB`);

    // Check motherload threshold
    if (motherloadOrb < config.motherloadThreshold) {
      logger.warn(`Motherload (${motherloadOrb.toFixed(2)} ORB) is below threshold (${config.motherloadThreshold} ORB)`);
      if (!config.dryRun) {
        throw new Error('Motherload below threshold. Aborting deployment.');
      }
    }

    // Get square mask (always 0 for ORB)
    const squareMask = getSquareMask();
    logger.info(`Deploying ${config.solPerDeployment} SOL to all 25 squares`);

    // Dry run check
    if (config.dryRun) {
      logger.info('[DRY RUN] Would deploy transaction here');
      logger.info(`[DRY RUN] Amount: ${config.solPerDeployment} SOL`);
      logger.info(`[DRY RUN] Square Mask: 0x${squareMask.toString(16)}`);
      return;
    }

    // Build and send deploy instruction
    const deployIx = await buildDeployInstruction(config.solPerDeployment);
    const { signature, fee: actualFee } = await sendAndConfirmTransaction([deployIx], 'Deploy');

    logger.info(`Deployment successful!`);
    logger.info(`Transaction: ${signature}`);
    logger.info(`Transaction Fee: ${actualFee.toFixed(6)} SOL`);
    logger.info(`Deployed: ${config.solPerDeployment} SOL to all 25 squares`);

    // Log to transactions file
    logger.info(`[TRANSACTION] Deploy | ${config.solPerDeployment} SOL | Fee: ${actualFee.toFixed(6)} SOL | ${signature}`);
  } catch (error) {
    logger.error('Deploy command failed:', error);
    throw error;
  }
}
