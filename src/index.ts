import logger from './utils/logger';
import { smartBotCommand } from './commands/smartBot';
import { pnlCommand } from './commands/pnl';
import { setBaselineCommand } from './commands/setBaseline';
import { initializeDatabase, closeDatabase } from './utils/database';
import { runQuery } from './utils/database';

/**
 * ORB Mining Bot - CLI Entry Point
 *
 * Commands:
 * - (no args): Run the smart autonomous bot
 * - pnl: Display profit & loss report
 * - set-baseline [amount]: Set starting wallet balance for PnL tracking
 * - reset-baseline: Delete existing baseline to set a new one
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

    if (command === 'reset-baseline') {
      // Reset baseline
      await initializeDatabase();
      await runQuery('DELETE FROM transactions WHERE type = ?', ['baseline']);
      logger.info('✅ Baseline reset successfully. Run the bot again to set a new baseline.');
      await closeDatabase();
      return;
    }

    if (command && command !== 'bot') {
      logger.error(`Unknown command: ${command}`);
      logger.info('');
      logger.info('Available commands:');
      logger.info('  (no args)              - Run autonomous mining bot');
      logger.info('  pnl                    - Display profit & loss report');
      logger.info('  set-baseline [amount]  - Set starting wallet balance');
      logger.info('  reset-baseline         - Delete existing baseline');
      process.exit(1);
    }

    // Default: Run the smart autonomous bot
    logger.info('🤖 ORB Mining Bot');
    logger.info('Loading configuration from database...');
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
