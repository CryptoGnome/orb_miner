import { initializeDatabase, closeDatabase, setBaselineBalance, getBaselineBalance } from '../utils/database';
import { getWallet } from '../utils/wallet';
import { getConnection } from '../utils/solana';
import logger, { ui } from '../utils/logger';

/**
 * Set baseline wallet balance for accurate PnL tracking
 * This should be run once before starting mining operations
 */
export async function setBaselineCommand(manualAmount?: number): Promise<void> {
  try {
    await initializeDatabase();

    ui.header('SET BASELINE WALLET BALANCE');
    ui.blank();

    // Check if baseline already exists
    const existing = await getBaselineBalance();
    if (existing > 0) {
      ui.warning(`Baseline already set to ${existing.toFixed(4)} SOL`);
      logger.info('');
      logger.info('To reset baseline, you must manually delete the baseline transaction from the database.');
      logger.info('Or use the reset-pnl script.');
      await closeDatabase();
      return;
    }

    let baselineAmount: number;

    if (manualAmount !== undefined) {
      // Use manually specified amount
      baselineAmount = manualAmount;
      ui.status('Manual Amount', `${baselineAmount.toFixed(4)} SOL`);
    } else {
      // Fetch current wallet balance
      const wallet = getWallet();
      const connection = getConnection();
      const lamports = await connection.getBalance(wallet.publicKey);
      baselineAmount = lamports / 1e9;

      ui.status('Current Wallet Balance', `${baselineAmount.toFixed(4)} SOL`);
      logger.info('');
      logger.info('⚠️  This will set your STARTING balance for PnL tracking.');
      logger.info('   Future profit/loss will be calculated from this baseline.');
      logger.info('');
      logger.info('💡 If you already started mining, enter your wallet balance');
      logger.info('   from BEFORE you began mining operations.');
    }

    // Set baseline
    await setBaselineBalance(baselineAmount);

    ui.blank();
    ui.success(`Baseline set to ${baselineAmount.toFixed(4)} SOL`);
    logger.info('');
    logger.info('✅ PnL tracking will now calculate true mining profit from this baseline.');

    await closeDatabase();
  } catch (error) {
    logger.error('Failed to set baseline:', error);
    throw error;
  }
}
