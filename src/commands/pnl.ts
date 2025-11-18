import {
  initializeDatabase,
  closeDatabase,
  getPnLSummary,
  getRecentTransactions,
  getRecentRounds,
  getDailySummaries,
  getQuickPnLSnapshot
} from '../utils/database';
import { getWallet, getBalances } from '../utils/wallet';
import { fetchMiner, getAutomationPDA } from '../utils/accounts';
import { getConnection } from '../utils/solana';
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
 * Display PnL (Profit and Loss) report with comprehensive mining statistics
 */
export async function pnlCommand(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase();

    ui.header('📊 PROFIT & LOSS REPORT');
    ui.blank();

    // Get current balances (including automation and pending claims)
    const wallet = getWallet();
    const balances = await getBalances();
    const miner = await fetchMiner(wallet.publicKey);
    const automationInfo = await getAutomationInfo();

    const currentAutomationBalance = automationInfo ? automationInfo.balance : 0;
    const currentClaimableSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
    const currentClaimableOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
    const currentWalletOrb = balances.orb;

    // Get PnL snapshot including current balances
    const pnlSnapshot = await getQuickPnLSnapshot(
      currentAutomationBalance,
      currentClaimableSol,
      currentClaimableOrb,
      currentWalletOrb
    );

    // Get overall PnL summary (historical data)
    const summary = await getPnLSummary();

    // Display overall statistics
    ui.section('OVERALL STATISTICS');
    ui.status('Rounds Participated', summary.roundsParticipated.toString());
    ui.blank();

    // SOL metrics (using pnlSnapshot which includes automation + pending)
    ui.section('SOL CAPITAL TRACKING');
    ui.status('💰 Capital Deployed', `${pnlSnapshot.totalDeployedSol.toFixed(4)} SOL`);
    logger.info(`   (Automation setup deposits only - individual round deploys don't add to this)`);
    ui.blank();

    ui.section('CURRENT HOLDINGS');
    ui.status('✅ Claimed Rewards', `${pnlSnapshot.totalClaimedSol.toFixed(4)} SOL`);
    ui.status('💱 From ORB Swaps', `${pnlSnapshot.totalSwappedSol.toFixed(4)} SOL`);
    ui.status('⚙️  In Automation', `${currentAutomationBalance.toFixed(4)} SOL (still mining)`);
    ui.status('⏳ Pending Claims', `${currentClaimableSol.toFixed(4)} SOL (not claimed yet)`);

    const totalSolReceived = pnlSnapshot.totalClaimedSol + pnlSnapshot.totalSwappedSol + currentAutomationBalance + currentClaimableSol;
    ui.status('📊 Total Current Value', `${totalSolReceived.toFixed(4)} SOL`);
    ui.blank();

    logger.info(`   Calculation: ${pnlSnapshot.totalClaimedSol.toFixed(4)} + ${pnlSnapshot.totalSwappedSol.toFixed(4)} + ${currentAutomationBalance.toFixed(4)} + ${currentClaimableSol.toFixed(4)} = ${totalSolReceived.toFixed(4)} SOL`);

    ui.section('PROFIT & LOSS');
    const solPnl = pnlSnapshot.netSolPnl;
    const solPnlColor = solPnl >= 0 ? '✅' : '❌';
    ui.status('Net SOL PnL', `${solPnlColor} ${solPnl >= 0 ? '+' : ''}${solPnl.toFixed(4)} SOL`);
    logger.info(`   Calculation: ${totalSolReceived.toFixed(4)} (current value) - ${pnlSnapshot.totalDeployedSol.toFixed(4)} (deployed) = ${solPnl.toFixed(4)} SOL`);

    if (pnlSnapshot.totalDeployedSol > 0) {
      const solRoi = (solPnl / pnlSnapshot.totalDeployedSol) * 100;
      ui.status('SOL ROI', `${solRoi >= 0 ? '+' : ''}${solRoi.toFixed(2)}%`);
    }
    ui.blank();

    // ORB metrics (using pnlSnapshot which includes wallet + pending)
    ui.section('ORB METRICS');
    ui.status('Total Claimed', `${pnlSnapshot.totalClaimedOrb.toFixed(2)} ORB`);
    ui.status('Total Swapped', `${pnlSnapshot.totalSwappedOrb.toFixed(2)} ORB`);
    ui.status('Total Staked', `${summary.totalStakedOrb.toFixed(2)} ORB`);
    ui.status('In Wallet', `${currentWalletOrb.toFixed(2)} ORB`);
    ui.status('Pending Claims', `${currentClaimableOrb.toFixed(2)} ORB`);

    const netOrbBalance = pnlSnapshot.netOrbBalance;
    ui.status('Net ORB Holdings', `${netOrbBalance.toFixed(2)} ORB`);

    if (summary.avgOrbPriceUsd > 0) {
      ui.status('Avg ORB Price', `$${summary.avgOrbPriceUsd.toFixed(2)}`);
      ui.status('Est. ORB Value', `$${summary.estimatedOrbValueUsd.toFixed(2)}`);
    }
    ui.blank();

    // Performance metrics
    ui.section('PERFORMANCE METRICS');
    if (summary.roundsParticipated > 0) {
      const avgDeployPerRound = summary.totalDeployedSol / summary.roundsParticipated;
      ui.status('Avg Deploy/Round', `${avgDeployPerRound.toFixed(4)} SOL`);

      const avgOrbPerRound = summary.totalClaimedOrb / summary.roundsParticipated;
      ui.status('Avg ORB/Round', `${avgOrbPerRound.toFixed(4)} ORB`);

      const avgSolPerRound = summary.totalClaimedSol / summary.roundsParticipated;
      ui.status('Avg SOL/Round', `${avgSolPerRound.toFixed(6)} SOL`);
    }
    ui.blank();

    // Get daily summaries
    const dailySummaries = await getDailySummaries(7);

    if (dailySummaries.length > 0) {
      ui.section('DAILY BREAKDOWN (Last 7 Days)');
      ui.blank();

      for (const day of dailySummaries) {
        const dayNetSol = (day.claimed_sol + day.swapped_sol) - day.deployed_sol;
        const dayNetSolColor = dayNetSol >= 0 ? '✅' : '❌';

        logger.info(`📅 ${day.date}`);
        logger.info(`   Rounds: ${day.rounds}`);
        logger.info(`   Deployed: ${day.deployed_sol.toFixed(4)} SOL`);
        logger.info(`   Claimed: ${day.claimed_sol.toFixed(4)} SOL + ${day.claimed_orb.toFixed(2)} ORB`);
        logger.info(`   Swapped: ${day.swapped_orb.toFixed(2)} ORB → ${day.swapped_sol.toFixed(4)} SOL`);
        logger.info(`   Day PnL: ${dayNetSolColor} ${dayNetSol >= 0 ? '+' : ''}${dayNetSol.toFixed(4)} SOL`);
        logger.info('');
      }
    }

    // Get recent transactions
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

    // Get recent rounds
    const recentRounds = await getRecentRounds(5);

    if (recentRounds.length > 0) {
      ui.section('RECENT ROUNDS');
      ui.blank();

      for (const round of recentRounds) {
        const date = new Date(round.timestamp).toLocaleString();
        logger.info(`🎯 Round ${round.round_id} - ${date}`);
        logger.info(`   Motherload: ${round.motherload.toFixed(2)} ORB`);
        logger.info(`   Deployed: ${round.deployed_amount.toFixed(4)} SOL (${round.squares_deployed} squares)`);
        logger.info(`   Automation Balance: ${round.automation_balance_before.toFixed(4)} → ${round.automation_balance_after.toFixed(4)} SOL`);
        logger.info('');
      }
    }

    ui.blank();
    ui.section('SUMMARY');
    const totalPnl = solPnl;
    const totalPnlColor = totalPnl >= 0 ? '✅' : '❌';

    if (totalPnl >= 0) {
      ui.success(`${totalPnlColor} PROFITABLE: +${totalPnl.toFixed(4)} SOL`);
    } else {
      ui.warning(`${totalPnlColor} UNPROFITABLE: ${totalPnl.toFixed(4)} SOL`);
    }

    if (summary.avgOrbPriceUsd > 0 && netOrbBalance > 0) {
      logger.info(`Plus ${netOrbBalance.toFixed(2)} ORB holdings (~$${summary.estimatedOrbValueUsd.toFixed(2)})`);
    }

    ui.blank();

    // Close database
    await closeDatabase();

  } catch (error) {
    logger.error('Failed to generate PnL report:', error);
    throw error;
  }
}
