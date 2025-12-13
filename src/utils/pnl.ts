/**
 * Unified PnL Calculation Module
 *
 * Core Principle: Total portfolio value is the source of truth
 * - Starting Balance: Initial SOL + initial ORB value (baseline)
 * - Current Balance: Current SOL + current ORB value (wallet + automation + claimable + staked)
 * - Profit = Current Balance - Starting Balance
 *
 * All holdings (SOL and ORB) are valued at current prices.
 * All other metrics (claims, swaps, fees) are just detailed breakdowns
 * of how the balance changed over time.
 */

import {
  getBaselineBalance,
  allQuery,
  getQuery,
} from './database';

// ============================================================================
// Core PnL Calculation
// ============================================================================

export interface TruePnL {
  // Balances
  startingBalance: number; // Baseline or earliest snapshot
  currentBalance: number; // Total of all holdings (SOL + ORB value)
  profit: number; // Current - Starting
  profitUsd: number; // Profit in USD
  roi: number; // ROI percentage

  // Current Holdings Breakdown
  holdings: {
    walletSol: number;
    automationSol: number;
    claimableSol: number;
    totalSol: number;

    walletOrb: number;
    claimableOrb: number;
    stakedOrb: number;
    totalOrb: number;
    orbValueSol: number; // ORB holdings × price
    orbValueUsd: number;
  };

  // Starting point tracking
  hasBaseline: boolean;
  baselineTimestamp: number | null;
}

/**
 * Get true PnL based on wallet balance changes
 * This is the primary PnL calculation - wallet balance as source of truth
 */
export async function getTruePnL(
  currentWalletSol: number,
  currentAutomationSol: number,
  currentClaimableSol: number,
  currentWalletOrb: number,
  currentClaimableOrb: number,
  currentStakedOrb: number,
  orbPriceSol: number,
  solPriceUsd: number = 0
): Promise<TruePnL> {
  // Get baseline (starting balance - fixed total value in SOL)
  const baselineBalance = await getBaselineBalance();
  const hasBaseline = baselineBalance > 0;

  // Get baseline timestamp
  let baselineTimestamp: number | null = null;
  if (hasBaseline) {
    const baselineRecord = await getQuery<{ timestamp: number }>(`
      SELECT timestamp FROM transactions WHERE type = 'baseline' ORDER BY timestamp ASC LIMIT 1
    `);
    baselineTimestamp = baselineRecord?.timestamp || null;
  }

  // If no baseline, use earliest balance snapshot (valued at current prices)
  let startingBalance = baselineBalance;
  if (!hasBaseline) {
    const earliestBalance = await getQuery<{
      wallet_sol: number;
      automation_sol: number;
      wallet_orb: number;
      staked_orb: number;
    }>(`
      SELECT wallet_sol, automation_sol, wallet_orb, staked_orb
      FROM balances
      ORDER BY timestamp ASC
      LIMIT 1
    `);
    if (earliestBalance) {
      // Value earliest snapshot at current prices
      const solValue = earliestBalance.wallet_sol + earliestBalance.automation_sol;
      const orbValue = (earliestBalance.wallet_orb + earliestBalance.staked_orb) * orbPriceSol;
      startingBalance = solValue + orbValue;
    }
  }

  // Calculate current holdings
  const totalSol = currentWalletSol + currentAutomationSol + currentClaimableSol;

  // Bot ORB (wallet + claimable)
  const botOrb = currentWalletOrb + currentClaimableOrb;

  // Total ORB including staked
  const totalOrb = botOrb + currentStakedOrb;
  const orbValueSol = totalOrb * orbPriceSol;
  const orbValueUsd = totalOrb * orbPriceSol * solPriceUsd;

  // Current balance = SOL + ORB value (in SOL)
  // This gives true portfolio value including all holdings
  const currentBalance = totalSol + orbValueSol;

  // Calculate profit including ORB holdings
  const profit = currentBalance - startingBalance;
  const profitUsd = profit * solPriceUsd;

  // Calculate ROI
  const roi = startingBalance > 0 ? (profit / startingBalance) * 100 : 0;

  return {
    startingBalance,
    currentBalance,
    profit,
    profitUsd,
    roi,

    holdings: {
      walletSol: currentWalletSol,
      automationSol: currentAutomationSol,
      claimableSol: currentClaimableSol,
      totalSol,

      walletOrb: currentWalletOrb,
      claimableOrb: currentClaimableOrb,
      stakedOrb: currentStakedOrb,
      totalOrb,
      orbValueSol,
      orbValueUsd,
    },

    hasBaseline,
    baselineTimestamp,
  };
}

// ============================================================================
// Detailed Breakdown (Income & Expenses)
// ============================================================================

export interface DetailedBreakdown {
  // Income sources
  income: {
    solFromMining: number; // claim_sol transactions
    orbFromMining: number; // claim_orb transactions
    orbFromStaking: number; // staking rewards
    solFromSwaps: number; // swap transactions (ORB → SOL)
    orbSwappedCount: number; // Amount of ORB swapped
    totalSolIncome: number; // solFromMining + solFromSwaps
    totalOrbIncome: number; // orbFromMining + orbFromStaking
  };

  // Expense breakdown
  expenses: {
    deployedSol: number; // Total SOL deployed (automation_setup - automation_close)
    transactionFees: number; // Sum of tx_fee_sol
    protocolFees: number; // Sum of protocol_fee_sol (10% deploy fee)
    totalExpenses: number; // Sum of all expenses
  };

  // Activity stats
  stats: {
    roundsParticipated: number;
    totalDeployments: number;
    totalClaims: number;
    totalSwaps: number;
    totalStakes: number;
    avgOrbPriceUsd: number;
    firstActivity: number | null; // Timestamp
    lastActivity: number | null; // Timestamp
  };
}

/**
 * Get detailed breakdown of income and expenses
 * This provides transparency on how profit was generated
 */
export async function getDetailedBreakdown(): Promise<DetailedBreakdown> {
  // Get income from transactions
  const incomeQuery = await getQuery<{
    sol_from_mining: number;
    orb_from_mining: number;
    sol_from_swaps: number;
    orb_swapped: number;
    total_claims: number;
    total_swaps: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'claim_sol' THEN sol_amount ELSE 0 END), 0) as sol_from_mining,
      COALESCE(SUM(CASE WHEN type = 'claim_orb' THEN orb_amount ELSE 0 END), 0) as orb_from_mining,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN sol_amount ELSE 0 END), 0) as sol_from_swaps,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN orb_amount ELSE 0 END), 0) as orb_swapped,
      COUNT(CASE WHEN type IN ('claim_sol', 'claim_orb') THEN 1 END) as total_claims,
      COUNT(CASE WHEN type = 'swap' THEN 1 END) as total_swaps
    FROM transactions
    WHERE status = 'success'
  `);

  // Get staking rewards (claim_yield transactions, NOT stake transactions)
  // NOTE: Stake transactions are just moving ORB, not earning it
  const stakingQuery = await getQuery<{ orb_from_staking: number }>(`
    SELECT COALESCE(SUM(orb_amount), 0) as orb_from_staking
    FROM transactions
    WHERE type = 'claim_yield' AND status = 'success'
  `);

  // Get expenses
  const expensesQuery = await getQuery<{
    deployed_sol: number;
    actual_deploys: number;
    transaction_fees: number;
    protocol_fees: number;
    total_deployments: number;
  }>(`
    SELECT
      COALESCE(
        SUM(CASE WHEN type = 'automation_setup' THEN sol_amount
                 WHEN type = 'automation_close' THEN -sol_amount
                 ELSE 0 END),
        0
      ) as deployed_sol,
      COALESCE(SUM(CASE WHEN type = 'deploy' THEN sol_amount ELSE 0 END), 0) as actual_deploys,
      COALESCE(SUM(tx_fee_sol), 0) as transaction_fees,
      COALESCE(SUM(protocol_fee_sol), 0) as protocol_fees,
      COUNT(CASE WHEN type = 'deploy' THEN 1 END) as total_deployments
    FROM transactions
    WHERE status = 'success'
  `);

  // Get activity stats
  const statsQuery = await getQuery<{
    rounds: number;
    total_stakes: number;
    avg_orb_price: number;
    first_activity: number;
    last_activity: number;
  }>(`
    SELECT
      COUNT(DISTINCT round_id) as rounds,
      COUNT(CASE WHEN type = 'stake' THEN 1 END) as total_stakes,
      COALESCE(AVG(orb_price_usd), 0) as avg_orb_price,
      MIN(timestamp) as first_activity,
      MAX(timestamp) as last_activity
    FROM transactions
    WHERE status = 'success'
  `);

  const income = {
    solFromMining: incomeQuery?.sol_from_mining || 0,
    orbFromMining: incomeQuery?.orb_from_mining || 0,
    orbFromStaking: stakingQuery?.orb_from_staking || 0,
    solFromSwaps: incomeQuery?.sol_from_swaps || 0,
    orbSwappedCount: incomeQuery?.orb_swapped || 0,
    totalSolIncome: (incomeQuery?.sol_from_mining || 0) + (incomeQuery?.sol_from_swaps || 0),
    totalOrbIncome: (incomeQuery?.orb_from_mining || 0) + (stakingQuery?.orb_from_staking || 0),
  };

  const expenses = {
    deployedSol: expensesQuery?.deployed_sol || 0,
    transactionFees: expensesQuery?.transaction_fees || 0,
    protocolFees: expensesQuery?.protocol_fees || 0,
    // Total expenses = only actual fees, NOT deployed capital
    totalExpenses: (expensesQuery?.transaction_fees || 0) +
                   (expensesQuery?.protocol_fees || 0),
  };

  const stats = {
    roundsParticipated: statsQuery?.rounds || 0,
    totalDeployments: expensesQuery?.total_deployments || 0,
    totalClaims: incomeQuery?.total_claims || 0,
    totalSwaps: incomeQuery?.total_swaps || 0,
    totalStakes: statsQuery?.total_stakes || 0,
    avgOrbPriceUsd: statsQuery?.avg_orb_price || 0,
    firstActivity: statsQuery?.first_activity || null,
    lastActivity: statsQuery?.last_activity || null,
  };

  return {
    income,
    expenses,
    stats,
  };
}

// ============================================================================
// Complete PnL Summary (Combines both)
// ============================================================================

export interface CompletePnLSummary {
  truePnL: TruePnL;
  breakdown: DetailedBreakdown;

  // Quick summary metrics
  summary: {
    netProfit: number; // Same as truePnL.profit
    netProfitUsd: number;
    roi: number;
    totalValue: number; // Current balance
    totalIncome: number; // From breakdown
    totalExpenses: number; // From breakdown
    isProfitable: boolean;
  };
}

/**
 * Get complete PnL summary with all details
 * This is the most comprehensive view of bot performance
 */
export async function getCompletePnLSummary(
  currentWalletSol: number,
  currentAutomationSol: number,
  currentClaimableSol: number,
  currentWalletOrb: number,
  currentClaimableOrb: number,
  currentStakedOrb: number,
  orbPriceSol: number,
  solPriceUsd: number = 0
): Promise<CompletePnLSummary> {
  const truePnL = await getTruePnL(
    currentWalletSol,
    currentAutomationSol,
    currentClaimableSol,
    currentWalletOrb,
    currentClaimableOrb,
    currentStakedOrb,
    orbPriceSol,
    solPriceUsd
  );

  const breakdown = await getDetailedBreakdown();

  const summary = {
    netProfit: truePnL.profit,
    netProfitUsd: truePnL.profitUsd,
    roi: truePnL.roi,
    totalValue: truePnL.currentBalance,
    // Total income = only SOL income (ORB only counts when swapped)
    totalIncome: breakdown.income.totalSolIncome,
    totalExpenses: breakdown.expenses.totalExpenses,
    isProfitable: truePnL.profit > 0,
  };

  return {
    truePnL,
    breakdown,
    summary,
  };
}

// ============================================================================
// Balance History & Charts
// ============================================================================

export interface BalanceSnapshot {
  timestamp: number;
  totalSol: number;
  totalOrb: number;
  totalValue: number; // SOL + ORB value
  orbPriceUsd: number;
}

/**
 * Get balance history for charting
 * Returns snapshots of wallet balance over time
 */
export async function getBalanceHistory(limit: number = 100): Promise<BalanceSnapshot[]> {
  const snapshots = await allQuery<{
    timestamp: number;
    wallet_sol: number;
    automation_sol: number;
    claimable_sol: number;
    wallet_orb: number;
    claimable_orb: number;
    staked_orb: number;
    orb_price_usd: number;
  }>(`
    SELECT
      timestamp,
      wallet_sol,
      automation_sol,
      claimable_sol,
      wallet_orb,
      claimable_orb,
      staked_orb,
      orb_price_usd
    FROM balances
    ORDER BY timestamp DESC
    LIMIT ?
  `, [limit]);

  // Get latest ORB price in SOL for value calculation
  const latestPrice = await getQuery<{ orb_price_sol: number }>(`
    SELECT orb_price_sol FROM prices ORDER BY timestamp DESC LIMIT 1
  `);
  const orbPriceSol = latestPrice?.orb_price_sol || 0;

  return snapshots.map((s: {
    timestamp: number;
    wallet_sol: number;
    automation_sol: number;
    claimable_sol: number;
    wallet_orb: number;
    claimable_orb: number;
    staked_orb: number;
    orb_price_usd: number;
  }) => {
    const totalSol = s.wallet_sol + s.automation_sol + s.claimable_sol;
    const totalOrb = s.wallet_orb + s.claimable_orb + s.staked_orb;
    const totalValue = totalSol + (totalOrb * orbPriceSol);

    return {
      timestamp: s.timestamp,
      totalSol,
      totalOrb,
      totalValue,
      orbPriceUsd: s.orb_price_usd,
    };
  }).reverse(); // Return chronological order for charting
}

// ============================================================================
// Wallet Reconciliation
// ============================================================================

export interface WalletReconciliation {
  currentWalletBalance: number;
  expectedWalletBalance: number;
  difference: number;
  isReconciled: boolean;
  discrepancyReasons: string[];
}

/**
 * Reconcile wallet balance with transaction history
 * Helps identify missing transactions or tracking issues
 */
export async function reconcileWallet(
  currentWalletSol: number,
  baselineBalance: number
): Promise<WalletReconciliation> {
  // Calculate expected balance from transactions
  const txSummary = await getQuery<{
    automation_setup: number;
    automation_close: number;
    sol_claimed: number;
    sol_swapped: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'automation_setup' THEN sol_amount ELSE 0 END), 0) as automation_setup,
      COALESCE(SUM(CASE WHEN type = 'automation_close' THEN sol_amount ELSE 0 END), 0) as automation_close,
      COALESCE(SUM(CASE WHEN type = 'claim_sol' THEN sol_amount ELSE 0 END), 0) as sol_claimed,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN sol_amount ELSE 0 END), 0) as sol_swapped
    FROM transactions
    WHERE status = 'success'
  `);

  const expectedBalance = baselineBalance
    - (txSummary?.automation_setup || 0) // Money moved to automation
    + (txSummary?.automation_close || 0) // Money returned from automation
    + (txSummary?.sol_claimed || 0) // Rewards claimed
    + (txSummary?.sol_swapped || 0); // SOL from swaps

  const difference = currentWalletSol - expectedBalance;
  const isReconciled = Math.abs(difference) < 0.1; // Within 0.1 SOL tolerance

  const discrepancyReasons: string[] = [];
  if (!isReconciled) {
    if (difference > 0) {
      discrepancyReasons.push(`Wallet has ${difference.toFixed(4)} SOL more than expected`);
      discrepancyReasons.push('Possible reasons: Missing transaction records, manual deposits');
    } else {
      discrepancyReasons.push(`Wallet has ${Math.abs(difference).toFixed(4)} SOL less than expected`);
      discrepancyReasons.push('Possible reasons: Unrecorded fees, failed transactions, manual withdrawals');
    }
  }

  return {
    currentWalletBalance: currentWalletSol,
    expectedWalletBalance: expectedBalance,
    difference,
    isReconciled,
    discrepancyReasons,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format SOL amount with proper decimals
 */
export function formatSol(amount: number): string {
  return amount.toFixed(4);
}

/**
 * Format ORB amount with proper decimals
 */
export function formatOrb(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Format USD amount
 */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Get color for profit display (for terminal output)
 */
export function getProfitColor(amount: number): 'green' | 'red' | 'yellow' {
  if (amount > 0) return 'green';
  if (amount < 0) return 'red';
  return 'yellow';
}
