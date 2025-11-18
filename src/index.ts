import { config } from './utils/config';
import logger from './utils/logger';
import { smartBotCommand } from './commands/smartBot';

/**
 * ORB Mining Bot - Smart Autonomous Mode
 *
 * One command that handles everything:
 * - Auto-setup automation account (first run)
 * - Auto-mine (continuous deployment to rounds)
 * - Auto-claim (periodic reward collection)
 * - Auto-swap (refund automation when low)
 * - Auto-stake (optional, stake excess ORB)
 *
 * Fully autonomous, threshold-driven operation.
 * Just run: npm start
 */

async function main() {
  try {
    logger.info('🤖 ORB Mining Bot');
    logger.info(`Network: ${config.network}`);
    logger.info(`ORB Program: ${config.orbProgramId.toBase58()}`);
    logger.info('');

    // Run the smart autonomous bot
    await smartBotCommand();

    logger.info('Bot stopped successfully');
  } catch (error) {
    logger.error('Bot execution failed:', error);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
