import {
  initializeDatabase,
  closeDatabase,
  getRecentTransactions,
  getDailySummaries,
} from '../utils/database';
import {
  getCompletePnLSummary,
  formatSol,
  formatOrb,
  formatPercent,
} from '../utils/pnl';
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
 * Display PnL (Profit and Loss) report using unified PnL system
 *
 * UNIFIED MODEL:
 * - Wallet balance as source of truth
 * - Starting Balance → Current Balance = Profit
 * - Detailed breakdown of income and expenses
 * - In-flight deployment tracking
 * - ORB value included in holdings
 */
export async function pnlCommand(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();

    ui.header('💰 MINING PROFIT & LOSS (Unified System)');
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
    const orbPriceUsd = orbPriceData.priceInUsd || 0;
    const solPriceUsd = orbPriceUsd / orbPriceInSol; // Derive SOL price

    // Get complete PnL summary using unified system
    const pnl = await getCompletePnLSummary(
      currentWalletSol,
      currentAutomationSol,
      currentPendingSol,
      currentWalletOrb,
      currentPendingOrb,
      currentStakedOrb,
      orbPriceInSol,
      solPriceUsd
    );

    // ====================
    // PROFIT & LOSS SUMMARY
    // ====================
    ui.section('PROFIT & LOSS SUMMARY');

    const profitIcon = pnl.summary.isProfitable ? '✅' : '❌';
    const profitSign = pnl.summary.netProfit >= 0 ? '+' : '';

    ui.status(`${profitIcon} Net Profit`, `${profitSign}${formatSol(pnl.summary.netProfit)} SOL (${formatPercent(pnl.summary.roi)})`);
    ui.status('Starting Balance', `${formatSol(pnl.truePnL.startingBalance)} SOL`);
    ui.status('Current Balance', `${formatSol(pnl.truePnL.currentBalance)} SOL`);

    if (!pnl.truePnL.hasBaseline) {
      ui.warning('⚠️  No baseline set - profit calculated from earliest snapshot');
      logger.info('   Run: npx ts-node src/index.ts set-baseline <amount>');
    }
    ui.blank();

    // ====================
    // CURRENT HOLDINGS
    // ====================
    ui.section('CURRENT HOLDINGS');

    ui.status('Wallet SOL', `${formatSol(pnl.truePnL.holdings.walletSol)} SOL`);
    ui.status('Automation SOL', `${formatSol(pnl.truePnL.holdings.automationSol)} SOL (still mining)`);
    ui.status('Claimable SOL', `${formatSol(pnl.truePnL.holdings.claimableSol)} SOL (pending)`);
    ui.status('💰 Total SOL', `${formatSol(pnl.truePnL.holdings.totalSol)} SOL`);
    ui.blank();

    ui.status('Total ORB', `${formatOrb(pnl.truePnL.holdings.totalOrb)} ORB`);
    logger.info(`  = ${formatOrb(currentPendingOrb)} pending + ${formatOrb(currentWalletOrb)} wallet + ${formatOrb(currentStakedOrb)} staked`);
    if (orbPriceInSol > 0) {
      ui.status('ORB Value', `${formatSol(pnl.truePnL.holdings.orbValueSol)} SOL @ $${orbPriceUsd.toFixed(2)}/ORB`);
    }
    ui.blank();

    // ====================
    // INCOME BREAKDOWN
    // ====================
    ui.section('INCOME BREAKDOWN');

    ui.status('SOL from Mining', `${formatSol(pnl.breakdown.income.solFromMining)} SOL`);
    ui.status('ORB from Mining', `${formatOrb(pnl.breakdown.income.orbFromMining)} ORB`);

    if (pnl.breakdown.income.solFromSwaps > 0) {
      ui.status('SOL from Swaps', `${formatSol(pnl.breakdown.income.solFromSwaps)} SOL`);
      logger.info(`  (Sold ${formatOrb(pnl.breakdown.income.orbSwappedCount)} ORB)`);
    }

    ui.status('📈 Total SOL Income', `${formatSol(pnl.breakdown.income.totalSolIncome)} SOL`);
    ui.blank();

    // ====================
    // EXPENSE BREAKDOWN
    // ====================
    ui.section('EXPENSE BREAKDOWN');

    ui.status('Capital Deployed', `${formatSol(pnl.breakdown.expenses.deployedSol)} SOL`);
    ui.status('Transaction Fees', `${formatSol(pnl.breakdown.expenses.transactionFees)} SOL`);
    ui.status('Protocol Fees (10%)', `${formatSol(pnl.breakdown.expenses.protocolFees)} SOL`);
    ui.status('Dev Fees (0.5%)', `${formatSol(pnl.breakdown.expenses.devFees)} SOL`);
    ui.status('💸 Total Expenses', `${formatSol(pnl.breakdown.expenses.totalExpenses)} SOL`);
    ui.blank();

    // ====================
    // ACTIVITY STATS
    // ====================
    ui.section('ACTIVITY STATS');

    ui.status('Rounds Participated', `${pnl.breakdown.stats.roundsParticipated}`);
    ui.status('Total Deployments', `${pnl.breakdown.stats.totalDeployments}`);
    ui.status('Total Claims', `${pnl.breakdown.stats.totalClaims}`);
    ui.status('Total Swaps', `${pnl.breakdown.stats.totalSwaps}`);

    if (pnl.breakdown.stats.firstActivity) {
      const firstDate = new Date(pnl.breakdown.stats.firstActivity);
      const lastDate = new Date(pnl.breakdown.stats.lastActivity!);
      const daysSince = Math.floor((Date.now() - pnl.breakdown.stats.firstActivity) / (1000 * 60 * 60 * 24));

      ui.status('First Activity', `${firstDate.toLocaleString()} (${daysSince} days ago)`);
      ui.status('Last Activity', `${lastDate.toLocaleString()}`);
    }
    ui.blank();

    // ====================
    // BASELINE TRACKING
    // ====================
    if (pnl.truePnL.hasBaseline) {
      ui.section('BASELINE TRACKING');
      ui.status('✅ Baseline Set', `${formatSol(pnl.truePnL.startingBalance)} SOL`);
      if (pnl.truePnL.baselineTimestamp) {
        const baselineDate = new Date(pnl.truePnL.baselineTimestamp);
        ui.status('Baseline Date', baselineDate.toLocaleString());
      }
      ui.blank();
    }

    // ====================
    // RECENT ACTIVITY
    // ====================

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

    if (pnl.summary.isProfitable) {
      ui.success(`✅ PROFITABLE: +${pnl.summary.netProfit.toFixed(4)} SOL (+${pnl.summary.roi.toFixed(2)}% ROI)`);
    } else {
      ui.warning(`❌ UNPROFITABLE: ${pnl.summary.netProfit.toFixed(4)} SOL (${pnl.summary.roi.toFixed(2)}% ROI)`);
    }

    if (pnl.truePnL.holdings.orbValueSol > 0) {
      logger.info(`Including ${pnl.truePnL.holdings.totalOrb.toFixed(2)} ORB holdings (~${pnl.truePnL.holdings.orbValueSol.toFixed(4)} SOL)`);
    }

    if (!pnl.truePnL.hasBaseline) {
      logger.info('');
      logger.info('💡 Tip: Run `npx ts-node src/index.ts set-baseline <amount>` for accurate profit tracking');
    }

    ui.blank();

    // Close database
    await closeDatabase();

  } catch (error) {
    logger.error('Failed to generate PnL report:', error);
    throw error;
  }
}
