import {
  initializeDatabase,
  closeDatabase,
  getImprovedPnLSummary,
  getRecentTransactions,
  getDailySummaries,
} from '../utils/database';
import { getWallet, getBalances } from '../utils/wallet';
import { fetchMiner, getAutomationPDA } from '../utils/accounts';
import { getConnection } from '../utils/solana';
import { getOrbPrice } from '../utils/jupiter';
import logger, { ui } from '../utils/logger';

/**
 * Get automation account info
 */
async function getAutomationInfo() {
  try {
    const connection = getConnection();
    const wallet = getWallet();
    const [automationPDA] = getAutomationPDA(wallet.publicKey);
    const accountInfo = await connection.getAccountInfo(automationPDA);

    if (!accountInfo || accountInfo.data.length < 112) {
      return null;
    }

    const data = accountInfo.data;
    const balance = data.readBigUInt64LE(48);

    return {
      balance: Number(balance) / 1e9,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Display PnL (Profit and Loss) report with improved accuracy
 *
 * NEW MODEL:
 * - Separates capital (what you have) from income/expenses
 * - Includes ORB value in total PnL
 * - Tracks actual fees from checkpoint returns
 * - Adds wallet reconciliation
 * - Shows baseline balance if set
 */
export async function pnlCommand(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();

    ui.header('💰 MINING PROFIT & LOSS');
    ui.blank();

    // Get current on-chain balances
    const wallet = getWallet();
    const connection = getConnection();
    const balances = await getBalances();
    const miner = await fetchMiner(wallet.publicKey);
    const automationInfo = await getAutomationInfo();

    const walletLamports = await connection.getBalance(wallet.publicKey);
    const currentWalletSol = walletLamports / 1e9;
    const currentAutomationSol = automationInfo ? automationInfo.balance : 0;
    const currentPendingSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
    const currentPendingOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
    const currentWalletOrb = balances.orb;

    // Get staked ORB
    let currentStakedOrb = 0;
    try {
      const { fetchStake } = await import('../utils/accounts');
      const stake = await fetchStake(wallet.publicKey);
      if (stake) {
        currentStakedOrb = Number(stake.balance) / 1e9;
      }
    } catch {
      // No stake account
    }

    // Fetch ORB price
    logger.info('Fetching ORB price...');
    const orbPriceData = await getOrbPrice();
    const orbPriceInSol = orbPriceData.priceInSol || 0;

    // Get improved PnL summary
    const pnl = await getImprovedPnLSummary(
      currentWalletSol,
      currentAutomationSol,
      currentPendingSol,
      currentPendingOrb,
      currentWalletOrb,
      currentStakedOrb,
      orbPriceInSol
    );

    // ====================
    // CAPITAL (What you have now)
    // ====================
    ui.section('CAPITAL');
    ui.status('Wallet Balance', `${pnl.currentWalletSol.toFixed(4)} SOL`);
    ui.status('Automation Balance', `${pnl.currentAutomationSol.toFixed(4)} SOL (still mining)`);
    ui.status('Pending Claims', `${pnl.currentPendingSol.toFixed(4)} SOL (not claimed yet)`);
    ui.status('Total SOL Capital', `${pnl.totalCapital.toFixed(4)} SOL`);
    ui.blank();

    ui.status('ORB Holdings', `${pnl.currentOrbHoldings.toFixed(2)} ORB`);
    logger.info(`  = ${currentPendingOrb.toFixed(2)} pending + ${currentWalletOrb.toFixed(2)} wallet + ${currentStakedOrb.toFixed(2)} staked`);
    if (orbPriceInSol > 0) {
      ui.status('ORB Value', `${pnl.orbValueInSol.toFixed(4)} SOL (@ ${orbPriceInSol.toFixed(6)} SOL/ORB)`);
    }
    ui.blank();

    ui.status('💎 Total Capital', `${(pnl.totalCapital + pnl.orbValueInSol).toFixed(4)} SOL equivalent`);
    ui.blank();

    // ====================
    // INCOME (What you earned)
    // ====================
    ui.section('INCOME');
    ui.status('SOL Rewards Claimed', `${pnl.solRewardsClaimed.toFixed(4)} SOL`);
    ui.status('ORB Swapped to SOL', `${pnl.orbSwappedToSol.toFixed(4)} SOL`);
    if (orbPriceInSol > 0) {
      ui.status('ORB Holdings Value', `${pnl.orbValueInSol.toFixed(4)} SOL`);
    }
    ui.status('📈 Total Income', `${pnl.totalIncome.toFixed(4)} SOL`);
    ui.blank();

    // ====================
    // EXPENSES (What you spent)
    // ====================
    ui.section('EXPENSES');

    if (pnl.actualFeesPaid > 0) {
      ui.status('Deploy Fees (Actual)', `${pnl.actualFeesPaid.toFixed(4)} SOL`);
      logger.info(`  (From checkpoint tracking)`);
    } else {
      ui.status('Deploy Fees (Estimated)', `${(pnl.estimatedTxFees * 0.05).toFixed(4)} SOL`);
      logger.info(`  ⚠️  Enable checkpoint tracking for actual fees`);
    }

    ui.status('Transaction Fees', `${pnl.estimatedTxFees.toFixed(4)} SOL`);
    logger.info(`  (${pnl.totalDeployTxCount} transactions × ~0.0085 SOL)`);

    ui.status('Dev Fees (0.1%)', `${pnl.estimatedDevFees.toFixed(4)} SOL`);
    ui.status('💸 Total Expenses', `${pnl.totalExpenses.toFixed(4)} SOL`);
    ui.blank();

    // ====================
    // PROFIT & LOSS
    // ====================
    ui.section('NET PROFIT / LOSS');

    const solPnlIcon = pnl.netProfitSol >= 0 ? '✅' : '❌';
    const totalPnlIcon = pnl.netProfitTotal >= 0 ? '✅' : '❌';

    ui.status(`${solPnlIcon} SOL Only PnL`, `${pnl.netProfitSol >= 0 ? '+' : ''}${pnl.netProfitSol.toFixed(4)} SOL`);
    logger.info(`  = Income (${pnl.solRewardsClaimed.toFixed(4)} + ${pnl.orbSwappedToSol.toFixed(4)}) - Expenses (${pnl.totalExpenses.toFixed(4)})`);

    ui.status(`${totalPnlIcon} Total PnL (incl ORB)`, `${pnl.netProfitTotal >= 0 ? '+' : ''}${pnl.netProfitTotal.toFixed(4)} SOL`);
    logger.info(`  = Total Income (${pnl.totalIncome.toFixed(4)}) - Expenses (${pnl.totalExpenses.toFixed(4)})`);

    const roiIcon = pnl.roiPercent >= 0 ? '✅' : '❌';
    ui.status(`${roiIcon} ROI`, `${pnl.roiPercent >= 0 ? '+' : ''}${pnl.roiPercent.toFixed(2)}%`);
    ui.blank();

    // ====================
    // BASELINE & RECONCILIATION
    // ====================
    if (pnl.hasBaseline) {
      ui.section('BASELINE TRACKING');
      ui.status('Starting Balance', `${pnl.baselineBalance.toFixed(4)} SOL`);
      ui.status('Current Total', `${(pnl.totalCapital + pnl.orbValueInSol).toFixed(4)} SOL`);
      const truePnl = (pnl.totalCapital + pnl.orbValueInSol) - pnl.baselineBalance;
      const truePnlIcon = truePnl >= 0 ? '✅' : '❌';
      ui.status(`${truePnlIcon} True Mining Profit`, `${truePnl >= 0 ? '+' : ''}${truePnl.toFixed(4)} SOL`);
      ui.blank();
    } else {
      ui.section('BASELINE TRACKING');
      ui.warning('⚠️  No baseline balance set');
      logger.info('   Run: node dist/index.js set-baseline');
      logger.info('   This will enable accurate true profit tracking.');
      ui.blank();
    }

    ui.section('WALLET RECONCILIATION');
    if (pnl.hasBaseline) {
      ui.status('Expected Wallet', `${pnl.expectedWalletBalance.toFixed(4)} SOL`);
      ui.status('Actual Wallet', `${pnl.currentWalletSol.toFixed(4)} SOL`);
      ui.status('Difference', `${pnl.walletDifference >= 0 ? '+' : ''}${pnl.walletDifference.toFixed(4)} SOL`);

      if (pnl.walletReconciled) {
        ui.success('✅ Wallet reconciled - all SOL accounted for');
      } else {
        ui.warning('⚠️  Wallet mismatch detected - check for missing transactions');
      }
    } else {
      logger.info('   Set baseline to enable reconciliation');
    }
    ui.blank();

    // ====================
    // STATISTICS
    // ====================
    ui.section('STATISTICS');
    ui.status('Rounds Participated', pnl.roundsParticipated.toString());
    ui.status('Deploy Transactions', pnl.totalDeployTxCount.toString());

    if (pnl.roundsParticipated > 0) {
      const avgIncomePerRound = pnl.totalIncome / pnl.roundsParticipated;
      const avgExpensesPerRound = pnl.totalExpenses / pnl.roundsParticipated;
      ui.status('Avg Income/Round', `${avgIncomePerRound.toFixed(6)} SOL`);
      ui.status('Avg Expenses/Round', `${avgExpensesPerRound.toFixed(6)} SOL`);
    }
    ui.blank();

    // ====================
    // DAILY BREAKDOWN
    // ====================
    const dailySummaries = await getDailySummaries(7);
    if (dailySummaries.length > 0) {
      ui.section('DAILY BREAKDOWN (Last 7 Days)');
      ui.blank();

      for (const day of dailySummaries) {
        const dayNetSol = (day.claimed_sol + day.swapped_sol) - day.deployed_sol;
        const dayNetSolColor = dayNetSol >= 0 ? '✅' : '❌';

        logger.info(`📅 ${day.date}`);
        logger.info(`   Rounds: ${day.rounds}`);
        if (day.deployed_sol > 0) {
          logger.info(`   Net Capital Change: ${day.deployed_sol >= 0 ? '+' : ''}${day.deployed_sol.toFixed(4)} SOL`);
        }
        logger.info(`   Claimed: ${day.claimed_sol.toFixed(4)} SOL + ${day.claimed_orb.toFixed(2)} ORB`);
        if (day.swapped_orb > 0) {
          logger.info(`   Swapped: ${day.swapped_orb.toFixed(2)} ORB → ${day.swapped_sol.toFixed(4)} SOL`);
        }
        logger.info(`   Day PnL: ${dayNetSolColor} ${dayNetSol >= 0 ? '+' : ''}${dayNetSol.toFixed(4)} SOL`);
        logger.info('');
      }
    }

    // ====================
    // RECENT TRANSACTIONS
    // ====================
    const recentTx = await getRecentTransactions(10);
    if (recentTx.length > 0) {
      ui.section('RECENT TRANSACTIONS');
      ui.blank();

      for (const tx of recentTx) {
        const date = new Date(tx.timestamp).toLocaleString();
        const type = tx.type.toUpperCase().replace('_', ' ');

        let details = '';
        if (tx.sol_amount > 0) details += `${tx.sol_amount.toFixed(4)} SOL`;
        if (tx.orb_amount > 0) {
          if (details) details += ' + ';
          details += `${tx.orb_amount.toFixed(2)} ORB`;
        }
        if (tx.round_id) details += ` (Round ${tx.round_id})`;

        logger.info(`[${date}] ${type}`);
        if (details) logger.info(`   ${details}`);
        if (tx.notes) logger.info(`   ${tx.notes}`);
        if (tx.signature) logger.info(`   Tx: ${tx.signature}`);
        logger.info('');
      }
    }

    // ====================
    // SUMMARY
    // ====================
    ui.blank();
    ui.section('SUMMARY');

    if (pnl.netProfitTotal >= 0) {
      ui.success(`✅ PROFITABLE: +${pnl.netProfitTotal.toFixed(4)} SOL (+${pnl.roiPercent.toFixed(2)}% ROI)`);
    } else {
      ui.warning(`❌ UNPROFITABLE: ${pnl.netProfitTotal.toFixed(4)} SOL (${pnl.roiPercent.toFixed(2)}% ROI)`);
    }

    if (pnl.orbValueInSol > 0) {
      logger.info(`Including ${pnl.currentOrbHoldings.toFixed(2)} ORB holdings (~${pnl.orbValueInSol.toFixed(4)} SOL)`);
    }

    if (!pnl.hasBaseline) {
      logger.info('');
      logger.info('💡 Tip: Run `node dist/index.js set-baseline` for more accurate PnL tracking');
    }

    ui.blank();

    // Close database
    await closeDatabase();

  } catch (error) {
    logger.error('Failed to generate PnL report:', error);
    throw error;
  }
}
