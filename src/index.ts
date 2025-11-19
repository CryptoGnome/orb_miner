import { config } from './utils/config';
import logger from './utils/logger';
import { smartBotCommand } from './commands/smartBot';
import { pnlCommand } from './commands/pnl';
import { setBaselineCommand } from './commands/setBaseline';

/**
 * ORB Mining Bot - CLI Entry Point
 *
 * Commands:
 * - (no args): Run the smart autonomous bot
 * - pnl: Display profit & loss report
 * - set-baseline [amount]: Set starting wallet balance for PnL tracking
 */

async function main() {
  try {
    const command = process.argv[2];
    const arg1 = process.argv[3];

    if (command === 'pnl') {
      // Display PnL report
      await pnlCommand();
      return;
    }

    if (command === 'set-baseline') {
      // Set baseline balance
      const amount = arg1 ? parseFloat(arg1) : undefined;
      await setBaselineCommand(amount);
      return;
    }

    if (command && command !== 'bot') {
      logger.error(`Unknown command: ${command}`);
      logger.info('');
      logger.info('Available commands:');
      logger.info('  (no args)              - Run autonomous mining bot');
      logger.info('  pnl                    - Display profit & loss report');
      logger.info('  set-baseline [amount]  - Set starting wallet balance');
      process.exit(1);
    }

    // Default: Run the smart autonomous bot
    logger.info('🤖 ORB Mining Bot');
    logger.info(`Network: ${config.network}`);
    logger.info(`ORB Program: ${config.orbProgramId.toBase58()}`);
    logger.info('');

    await smartBotCommand();

    logger.info('Bot stopped successfully');
  } catch (error) {
    logger.error('Command execution failed:', error);
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
