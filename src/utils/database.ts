import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import logger from './logger';

// Database file path
// If running from dashboard (process.cwd() ends with 'dashboard'), use parent directory
const isRunningFromDashboard = process.cwd().endsWith('dashboard');
const rootDir = isRunningFromDashboard ? path.join(process.cwd(), '..') : process.cwd();
const DB_DIR = path.join(rootDir, 'data');
const DB_PATH = path.join(DB_DIR, 'orb_mining.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Database instance
let db: sqlite3.Database | null = null;

/**
 * Initialize database and create tables if they don't exist
 */
export async function initializeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Failed to connect to database:', err);
        reject(err);
        return;
      }

      logger.info(`Database connected: ${DB_PATH}`);
      if (isRunningFromDashboard) {
        logger.info('Running from dashboard - using shared database in parent directory');
      }

      // Create tables
      createTables()
        .then(() => resolve())
        .catch((err) => reject(err));
    });
  });
}

/**
 * Create all database tables
 */
async function createTables(): Promise<void> {
  const tables = [
    // Transactions table - all on-chain activity
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      signature TEXT,
      round_id INTEGER,
      sol_amount REAL DEFAULT 0,
      orb_amount REAL DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Rounds table - round history
    `CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER UNIQUE NOT NULL,
      timestamp INTEGER NOT NULL,
      motherload REAL NOT NULL,
      deployed_amount REAL DEFAULT 0,
      squares_deployed INTEGER DEFAULT 0,
      automation_balance_before REAL DEFAULT 0,
      automation_balance_after REAL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Balances table - periodic snapshots
    `CREATE TABLE IF NOT EXISTS balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      wallet_sol REAL DEFAULT 0,
      wallet_orb REAL DEFAULT 0,
      automation_sol REAL DEFAULT 0,
      claimable_sol REAL DEFAULT 0,
      claimable_orb REAL DEFAULT 0,
      staked_orb REAL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Price history table - ORB price tracking
    `CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      orb_price_usd REAL NOT NULL,
      orb_price_sol REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // In-flight deployments table - track deployments awaiting rewards
    `CREATE TABLE IF NOT EXISTS in_flight_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      sol_amount REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Motherload history table - track motherload changes over time
    `CREATE TABLE IF NOT EXISTS motherload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      motherload REAL NOT NULL,
      round_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Settings table - runtime configurable settings
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Indexes for faster queries
    `CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
    `CREATE INDEX IF NOT EXISTS idx_rounds_timestamp ON rounds(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_balances_timestamp ON balances(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON prices(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_in_flight_resolved ON in_flight_deployments(resolved)`,
    `CREATE INDEX IF NOT EXISTS idx_motherload_timestamp ON motherload_history(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)`,
  ];

  for (const sql of tables) {
    await runQuery(sql);
  }

  // Add new columns to existing tables (safe to run multiple times)
  // Use silent query to avoid logging expected duplicate column errors
  const alterStatements = [
    `ALTER TABLE transactions ADD COLUMN orb_price_usd REAL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN tx_fee_sol REAL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN protocol_fee_sol REAL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN wallet_balance_before REAL DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN wallet_balance_after REAL DEFAULT 0`,
    `ALTER TABLE balances ADD COLUMN orb_price_usd REAL DEFAULT 0`,
  ];

  for (const sql of alterStatements) {
    try {
      await runQuerySilent(sql);
    } catch (err: any) {
      // Ignore "duplicate column name" errors (column already exists)
      if (!err.message.includes('duplicate column name')) {
        logger.error('Unexpected error during schema migration:', err);
        throw err;
      }
    }
  }

  logger.info('Database tables initialized');
}

/**
 * Run a SQL query with no return value
 */
export function runQuery(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run(sql, params, (err) => {
      if (err) {
        logger.error('Database query error:', err, { sql, params });
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Run a SQL query silently (no error logging) - for expected errors like duplicate columns
 */
function runQuerySilent(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Get a single row from database
 */
export function getQuery<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.get(sql, params, (err, row) => {
      if (err) {
        logger.error('Database query error:', err, { sql, params });
        reject(err);
        return;
      }
      resolve(row as T | undefined);
    });
  });
}

/**
 * Get all rows from database
 */
export function allQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error('Database query error:', err, { sql, params });
        reject(err);
        return;
      }
      resolve(rows as T[]);
    });
  });
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        logger.error('Failed to close database:', err);
        reject(err);
        return;
      }
      logger.info('Database connection closed');
      db = null;
      resolve();
    });
  });
}

// ============================================================================
// Transaction tracking functions
// ============================================================================

export interface TransactionRecord {
  type: 'deploy' | 'claim_sol' | 'claim_orb' | 'swap' | 'stake' | 'unstake' | 'automation_setup' | 'automation_close' | 'checkpoint_return' | 'baseline';
  signature?: string;
  roundId?: number;
  solAmount?: number;
  orbAmount?: number;
  status: 'success' | 'failed';
  notes?: string;
  orbPriceUsd?: number;
  txFeeSol?: number;
  protocolFeeSol?: number;
  walletBalanceBefore?: number;
  walletBalanceAfter?: number;
}

export async function recordTransaction(record: TransactionRecord): Promise<void> {
  const sql = `
    INSERT INTO transactions (
      timestamp, type, signature, round_id, sol_amount, orb_amount, status, notes,
      orb_price_usd, tx_fee_sol, protocol_fee_sol, wallet_balance_before, wallet_balance_after
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    Date.now(),
    record.type,
    record.signature || null,
    record.roundId || null,
    record.solAmount || 0,
    record.orbAmount || 0,
    record.status,
    record.notes || null,
    record.orbPriceUsd || 0,
    record.txFeeSol || 0,
    record.protocolFeeSol || 0,
    record.walletBalanceBefore || 0,
    record.walletBalanceAfter || 0,
  ];

  await runQuery(sql, params);
  logger.debug(`Recorded transaction: ${record.type} - ${record.status}`);
}

export async function recordRound(
  roundId: number,
  motherload: number,
  deployedAmount: number,
  squaresDeployed: number,
  automationBalanceBefore: number,
  automationBalanceAfter: number
): Promise<void> {
  const sql = `
    INSERT OR REPLACE INTO rounds (round_id, timestamp, motherload, deployed_amount, squares_deployed, automation_balance_before, automation_balance_after)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    roundId,
    Date.now(),
    motherload,
    deployedAmount,
    squaresDeployed,
    automationBalanceBefore,
    automationBalanceAfter,
  ];

  await runQuery(sql, params);
  logger.debug(`Recorded round ${roundId}: ${deployedAmount} SOL deployed`);
}

export async function recordBalance(
  walletSol: number,
  walletOrb: number,
  automationSol: number,
  claimableSol: number,
  claimableOrb: number,
  stakedOrb: number,
  orbPriceUsd: number = 0
): Promise<void> {
  const sql = `
    INSERT INTO balances (timestamp, wallet_sol, wallet_orb, automation_sol, claimable_sol, claimable_orb, staked_orb, orb_price_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    Date.now(),
    walletSol,
    walletOrb,
    automationSol,
    claimableSol,
    claimableOrb,
    stakedOrb,
    orbPriceUsd,
  ];

  await runQuery(sql, params);
  logger.debug('Recorded balance snapshot');
}

export async function recordPrice(orbPriceUsd: number, orbPriceSol: number): Promise<void> {
  const sql = `
    INSERT INTO prices (timestamp, orb_price_usd, orb_price_sol)
    VALUES (?, ?, ?)
  `;

  const params = [Date.now(), orbPriceUsd, orbPriceSol];

  await runQuery(sql, params);
  logger.debug(`Recorded ORB price: $${orbPriceUsd.toFixed(2)} / ${orbPriceSol.toFixed(6)} SOL`);
}

// ============================================================================
// Query functions for reporting
// ============================================================================

/**
 * PnL Accounting Logic:
 *
 * CAPITAL DEPLOYED (what you put in):
 * - automation_setup transactions only (initial deposits to automation account)
 * - NOT individual deploy transactions (those spend from automation account)
 *
 * CURRENT VALUE (what you have now):
 * - Claimed SOL (withdrawn rewards)
 * - Swapped SOL (from selling ORB)
 * - Automation balance (still working/mining)
 * - Pending claimable SOL (not yet claimed)
 *
 * NET PnL = Current Value - Capital Deployed
 *
 * Example:
 * - Deploy 10 SOL to automation (capital deployed = 10 SOL)
 * - Mine 5 rounds spending 2 SOL (automation balance = 8 SOL)
 * - Earn 0.5 SOL rewards (claimable = 0.5 SOL)
 * - Current value = 8 + 0.5 = 8.5 SOL
 * - Net PnL = 8.5 - 10 = -1.5 SOL (lost to fees/competition)
 */

export interface PnLSummary {
  totalDeployedSol: number;
  totalClaimedSol: number;
  totalClaimedOrb: number;
  totalSwappedOrb: number;
  totalSwappedSol: number;
  totalStakedOrb: number;
  roundsParticipated: number;
  netSolPnl: number;
  avgOrbPriceUsd: number;
  estimatedOrbValueUsd: number;
  totalPnlUsd: number;
}

export async function getPnLSummary(startTimestamp?: number, endTimestamp?: number): Promise<PnLSummary> {
  const whereClause = buildTimeWhereClause(startTimestamp, endTimestamp);

  // Get transaction totals
  // IMPORTANT: Only count automation_setup as capital deployed, NOT individual deploy transactions
  // Deploy transactions are spending from automation account (already counted in setup)
  // ALSO: Subtract automation_close amounts (money returned when closing automation)
  const txSummary = await getQuery<{
    total_deployed: number;
    total_claimed_sol: number;
    total_claimed_orb: number;
    total_swapped_orb: number;
    total_swapped_sol: number;
    total_staked: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'automation_setup' THEN sol_amount WHEN type = 'automation_close' THEN -sol_amount ELSE 0 END), 0) as total_deployed,
      COALESCE(SUM(CASE WHEN type = 'claim_sol' THEN sol_amount ELSE 0 END), 0) as total_claimed_sol,
      COALESCE(SUM(CASE WHEN type = 'claim_orb' THEN orb_amount ELSE 0 END), 0) as total_claimed_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN orb_amount ELSE 0 END), 0) as total_swapped_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN sol_amount ELSE 0 END), 0) as total_swapped_sol,
      COALESCE(SUM(CASE WHEN type = 'stake' THEN orb_amount ELSE 0 END), 0) as total_staked
    FROM transactions
    WHERE status = 'success' ${whereClause}
  `);

  // Get rounds count
  const roundsCount = await getQuery<{ count: number }>(`
    SELECT COUNT(DISTINCT round_id) as count
    FROM rounds
    ${whereClause ? 'WHERE ' + whereClause.replace('AND', '').trim() : ''}
  `);

  // Get average ORB price
  const avgPrice = await getQuery<{ avg_price_usd: number }>(`
    SELECT COALESCE(AVG(orb_price_usd), 0) as avg_price_usd
    FROM prices
    ${whereClause ? 'WHERE ' + whereClause.replace('AND', '').trim() : ''}
  `);

  const totalDeployedSol = txSummary?.total_deployed || 0;
  const totalClaimedSol = txSummary?.total_claimed_sol || 0;
  const totalClaimedOrb = txSummary?.total_claimed_orb || 0;
  const totalSwappedOrb = txSummary?.total_swapped_orb || 0;
  const totalSwappedSol = txSummary?.total_swapped_sol || 0;
  const totalStakedOrb = txSummary?.total_staked || 0;
  const roundsParticipated = roundsCount?.count || 0;
  const avgOrbPriceUsd = avgPrice?.avg_price_usd || 0;

  // Calculate net SOL PnL
  const netSolPnl = (totalClaimedSol + totalSwappedSol) - totalDeployedSol;

  // Calculate estimated ORB value
  const netOrbBalance = totalClaimedOrb - totalSwappedOrb;
  const estimatedOrbValueUsd = netOrbBalance * avgOrbPriceUsd;

  // Total PnL in USD (convert SOL to USD using avg ORB/SOL price)
  const totalPnlUsd = estimatedOrbValueUsd; // Simplified - can add SOL price conversion later

  return {
    totalDeployedSol,
    totalClaimedSol,
    totalClaimedOrb,
    totalSwappedOrb,
    totalSwappedSol,
    totalStakedOrb,
    roundsParticipated,
    netSolPnl,
    avgOrbPriceUsd,
    estimatedOrbValueUsd,
    totalPnlUsd,
  };
}

export async function getRecentTransactions(limit: number = 50): Promise<any[]> {
  const sql = `
    SELECT * FROM transactions
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  return allQuery(sql, [limit]);
}

export async function getRecentRounds(limit: number = 50): Promise<any[]> {
  const sql = `
    SELECT * FROM rounds
    ORDER BY round_id DESC
    LIMIT ?
  `;

  return allQuery(sql, [limit]);
}

export async function getBalanceHistory(limit: number = 100): Promise<any[]> {
  const sql = `
    SELECT * FROM balances
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  return allQuery(sql, [limit]);
}

function buildTimeWhereClause(startTimestamp?: number, endTimestamp?: number): string {
  const conditions = [];

  if (startTimestamp) {
    conditions.push(`timestamp >= ${startTimestamp}`);
  }

  if (endTimestamp) {
    conditions.push(`timestamp <= ${endTimestamp}`);
  }

  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
}

// ============================================================================
// Daily summary functions
// ============================================================================

export async function getDailySummaries(days: number = 7): Promise<any[]> {
  const sql = `
    SELECT
      date(timestamp / 1000, 'unixepoch') as date,
      COUNT(DISTINCT CASE WHEN type = 'deploy' THEN round_id END) as rounds,
      COALESCE(SUM(CASE WHEN type = 'automation_setup' THEN sol_amount WHEN type = 'automation_close' THEN -sol_amount ELSE 0 END), 0) as deployed_sol,
      COALESCE(SUM(CASE WHEN type = 'claim_sol' THEN sol_amount ELSE 0 END), 0) as claimed_sol,
      COALESCE(SUM(CASE WHEN type = 'claim_orb' THEN orb_amount ELSE 0 END), 0) as claimed_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN orb_amount ELSE 0 END), 0) as swapped_orb,
      COALESCE(SUM(CASE WHEN type = 'swap' THEN sol_amount ELSE 0 END), 0) as swapped_sol
    FROM transactions
    WHERE timestamp >= (strftime('%s', 'now') - (? * 86400)) * 1000
      AND status = 'success'
    GROUP BY date
    ORDER BY date DESC
  `;

  return allQuery(sql, [days]);
}

// ============================================================================
// Quick PnL summary for live bot display
// ============================================================================

export interface QuickPnLSnapshot {
  totalDeployedSol: number;
  totalClaimedSol: number;
  totalClaimedOrb: number;
  totalSwappedSol: number;
  totalSwappedOrb: number;
  netSolPnl: number;
  netOrbBalance: number;
  roundsParticipated: number;
}

/**
 * Get a quick PnL snapshot for live display
 * Includes current balances (automation + pending claims)
 */
export async function getQuickPnLSnapshot(
  currentAutomationBalance: number = 0,
  currentClaimableSol: number = 0,
  currentClaimableOrb: number = 0,
  currentWalletOrb: number = 0,
  currentStakedOrb: number = 0
): Promise<QuickPnLSnapshot> {
  const summary = await getPnLSummary();

  // If no setup was recorded but automation account exists with balance,
  // treat that balance as previously deployed capital (e.g., after database reset)
  let adjustedTotalDeployedSol = summary.totalDeployedSol;
  if (summary.totalDeployedSol === 0 && currentAutomationBalance > 0) {
    adjustedTotalDeployedSol = currentAutomationBalance;
  }

  // Calculate net SOL including:
  // - Claimed SOL
  // - Swapped SOL (from selling ORB)
  // - Current automation balance (deployed capital still working)
  // - Pending claimable SOL
  // - Minus total deployed
  const totalReceived = summary.totalClaimedSol + summary.totalSwappedSol + currentAutomationBalance + currentClaimableSol;
  const netSolPnl = totalReceived - adjustedTotalDeployedSol;

  // Calculate net ORB balance as current holdings
  // (Swapped ORB is shown separately since it was converted to SOL and already counted in SOL PnL)
  const netOrbBalance = currentClaimableOrb + currentWalletOrb + currentStakedOrb;

  return {
    totalDeployedSol: adjustedTotalDeployedSol,
    totalClaimedSol: summary.totalClaimedSol,
    totalClaimedOrb: summary.totalClaimedOrb,
    totalSwappedSol: summary.totalSwappedSol,
    totalSwappedOrb: summary.totalSwappedOrb,
    netSolPnl,
    netOrbBalance,
    roundsParticipated: summary.roundsParticipated,
  };
}

// ============================================================================
// Improved PnL Model Functions
// ============================================================================

/**
 * Get baseline (starting) wallet balance
 */
export async function getBaselineBalance(): Promise<number> {
  const baseline = await getQuery<{ sol_amount: number }>(`
    SELECT sol_amount
    FROM transactions
    WHERE type = 'baseline'
    ORDER BY timestamp ASC
    LIMIT 1
  `);

  return baseline?.sol_amount || 0;
}

/**
 * Set baseline balance (one-time operation)
 */
export async function setBaselineBalance(solAmount: number): Promise<void> {
  // Check if baseline already exists
  const existing = await getBaselineBalance();
  if (existing > 0) {
    logger.info(`Baseline already set to ${existing} SOL. Skipping.`);
    return;
  }

  await recordTransaction({
    type: 'baseline',
    solAmount,
    status: 'success',
    notes: 'Initial wallet balance before mining operations'
  });

  logger.info(`Baseline balance set to ${solAmount} SOL`);
}

/**
 * Get total actual fees paid from checkpoint tracking
 */
export async function getActualFeesPaid(): Promise<{
  deployTotal: number;
  checkpointReturns: number;
  actualFees: number;
}> {
  const result = await getQuery<{
    deploy_total: number;
    checkpoint_returns: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'deploy' THEN sol_amount ELSE 0 END), 0) as deploy_total,
      COALESCE(SUM(CASE WHEN type = 'checkpoint_return' THEN sol_amount ELSE 0 END), 0) as checkpoint_returns
    FROM transactions
    WHERE status = 'success'
  `);

  const deployTotal = result?.deploy_total || 0;
  const checkpointReturns = result?.checkpoint_returns || 0;
  const actualFees = deployTotal - checkpointReturns;

  return {
    deployTotal,
    checkpointReturns,
    actualFees: actualFees > 0 ? actualFees : 0,
  };
}

/**
 * Improved PnL Summary with proper separation of capital, income, and expenses
 */
export interface ImprovedPnLSummary {
  // Capital (what you have now)
  currentWalletSol: number;
  currentAutomationSol: number;
  currentPendingSol: number;
  currentOrbHoldings: number;
  currentStakedOrb: number;
  totalCapital: number;

  // Income (what you earned)
  solRewardsClaimed: number;
  orbSwappedToSol: number;
  orbValueInSol: number; // Current ORB holdings × price
  totalIncome: number;

  // Expenses (what you spent)
  actualFeesPaid: number; // From checkpoint tracking
  estimatedTxFees: number; // Based on transaction count
  estimatedDevFees: number; // 0.1% of deploys
  totalExpenses: number;

  // Profit calculation
  netProfitSol: number; // Income - Expenses
  netProfitTotal: number; // Including ORB value
  roiPercent: number;

  // Baseline tracking
  baselineBalance: number;
  hasBaseline: boolean;

  // Reconciliation
  expectedWalletBalance: number;
  walletDifference: number;
  walletReconciled: boolean;

  // Stats
  roundsParticipated: number;
  totalDeployTxCount: number;
  orbPriceInSol: number;
}

export async function getImprovedPnLSummary(
  currentWalletSol: number,
  currentAutomationSol: number,
  currentPendingSol: number,
  currentPendingOrb: number,
  currentWalletOrb: number,
  currentStakedOrb: number,
  orbPriceInSol: number
): Promise<ImprovedPnLSummary> {
  // Get baseline
  const baselineBalance = await getBaselineBalance();
  const hasBaseline = baselineBalance > 0;

  // Get income
  const summary = await getPnLSummary();
  const solRewardsClaimed = summary.totalClaimedSol;
  const orbSwappedToSol = summary.totalSwappedSol;

  // Calculate ORB holdings value
  const currentOrbHoldings = currentPendingOrb + currentWalletOrb + currentStakedOrb;
  const orbValueInSol = currentOrbHoldings * orbPriceInSol;

  // Get actual fees
  const fees = await getActualFeesPaid();
  const actualFeesPaid = fees.actualFees;

  // Estimate other fees
  const deployCount = await getQuery<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE type = 'deploy' AND status = 'success'
  `);
  const totalDeployTxCount = deployCount?.count || 0;
  const estimatedTxFees = totalDeployTxCount * 0.0085; // ~0.0085 SOL per tx (priority + base fees)
  const estimatedDevFees = fees.deployTotal * 0.001; // 0.1% dev fee

  // Calculate totals
  const totalCapital = currentWalletSol + currentAutomationSol + currentPendingSol;
  const totalIncome = solRewardsClaimed + orbSwappedToSol + orbValueInSol;
  const totalExpenses = actualFeesPaid + estimatedTxFees + estimatedDevFees;

  // Calculate profit
  const netProfitSol = solRewardsClaimed + orbSwappedToSol - totalExpenses;
  const netProfitTotal = totalIncome - totalExpenses;

  // Calculate ROI
  let roiPercent = 0;
  if (hasBaseline) {
    // True ROI: (Current - Starting) / Starting
    const currentTotal = totalCapital + orbValueInSol;
    roiPercent = ((currentTotal - baselineBalance) / baselineBalance) * 100;
  } else if (totalExpenses > 0) {
    // Fallback: Return on expenses
    roiPercent = (netProfitTotal / totalExpenses) * 100;
  }

  // Wallet reconciliation
  const setupTotals = await getQuery<{ total: number }>(`
    SELECT COALESCE(SUM(sol_amount), 0) as total
    FROM transactions
    WHERE type = 'automation_setup' AND status = 'success'
  `);
  const closeTotals = await getQuery<{ total: number }>(`
    SELECT COALESCE(SUM(sol_amount), 0) as total
    FROM transactions
    WHERE type = 'automation_close' AND status = 'success'
  `);

  let expectedWalletBalance = baselineBalance;
  if (hasBaseline) {
    expectedWalletBalance = baselineBalance
      - (setupTotals?.total || 0)
      + (closeTotals?.total || 0)
      + solRewardsClaimed
      + orbSwappedToSol;
  }

  const walletDifference = currentWalletSol - expectedWalletBalance;
  const walletReconciled = Math.abs(walletDifference) < 0.1; // Within 0.1 SOL tolerance

  return {
    // Capital
    currentWalletSol,
    currentAutomationSol,
    currentPendingSol,
    currentOrbHoldings,
    currentStakedOrb,
    totalCapital,

    // Income
    solRewardsClaimed,
    orbSwappedToSol,
    orbValueInSol,
    totalIncome,

    // Expenses
    actualFeesPaid,
    estimatedTxFees,
    estimatedDevFees,
    totalExpenses,

    // Profit
    netProfitSol,
    netProfitTotal,
    roiPercent,

    // Baseline
    baselineBalance,
    hasBaseline,

    // Reconciliation
    expectedWalletBalance,
    walletDifference,
    walletReconciled,

    // Stats
    roundsParticipated: summary.roundsParticipated,
    totalDeployTxCount,
    orbPriceInSol,
  };
}

// ============================================================================
// In-Flight Deployment Tracking Functions
// ============================================================================

export interface InFlightDeployment {
  id?: number;
  roundId: number;
  solAmount: number;
  timestamp: number;
  resolved: boolean;
}

/**
 * Record a new in-flight deployment (deployment awaiting rewards)
 */
export async function recordInFlightDeployment(roundId: number, solAmount: number): Promise<void> {
  const sql = `
    INSERT INTO in_flight_deployments (round_id, sol_amount, timestamp, resolved)
    VALUES (?, ?, ?, 0)
  `;

  const params = [roundId, solAmount, Date.now()];
  await runQuery(sql, params);
  logger.debug(`Recorded in-flight deployment: Round ${roundId}, ${solAmount} SOL`);
}

/**
 * Get all unresolved in-flight deployments
 */
export async function getUnresolvedInFlightDeployments(): Promise<InFlightDeployment[]> {
  const sql = `
    SELECT id, round_id as roundId, sol_amount as solAmount, timestamp, resolved
    FROM in_flight_deployments
    WHERE resolved = 0
    ORDER BY timestamp ASC
  `;

  const rows = await allQuery<any>(sql);
  return rows.map(row => ({
    id: row.id,
    roundId: row.roundId,
    solAmount: row.solAmount,
    timestamp: row.timestamp,
    resolved: row.resolved === 1,
  }));
}

/**
 * Mark in-flight deployments as resolved (rewards claimed)
 */
export async function resolveInFlightDeployments(roundIds: number[]): Promise<void> {
  if (roundIds.length === 0) return;

  const placeholders = roundIds.map(() => '?').join(',');
  const sql = `
    UPDATE in_flight_deployments
    SET resolved = 1
    WHERE round_id IN (${placeholders})
  `;

  await runQuery(sql, roundIds);
  logger.debug(`Resolved in-flight deployments for rounds: ${roundIds.join(', ')}`);
}

/**
 * Clean up old in-flight deployments (older than 10 minutes or 5 rounds)
 * These are likely orphaned due to rewards appearing on-chain
 */
export async function cleanupOldInFlightDeployments(): Promise<void> {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

  const sql = `
    UPDATE in_flight_deployments
    SET resolved = 1
    WHERE resolved = 0 AND timestamp < ?
  `;

  await runQuery(sql, [tenMinutesAgo]);
  logger.debug('Cleaned up old in-flight deployments');
}

/**
 * Get total SOL in unresolved in-flight deployments
 */
export async function getTotalInFlightSol(): Promise<number> {
  const result = await getQuery<{ total: number }>(`
    SELECT COALESCE(SUM(sol_amount), 0) as total
    FROM in_flight_deployments
    WHERE resolved = 0
  `);

  return result?.total || 0;
}

// ============================================================================
// Motherload Tracking Functions
// ============================================================================

export interface MotherloadRecord {
  id?: number;
  timestamp: number;
  motherload: number;
  roundId?: number;
}

/**
 * Record motherload value at a point in time
 */
export async function recordMotherload(motherload: number, roundId?: number): Promise<void> {
  const sql = `
    INSERT INTO motherload_history (timestamp, motherload, round_id)
    VALUES (?, ?, ?)
  `;

  const params = [Date.now(), motherload, roundId || null];
  await runQuery(sql, params);
  logger.debug(`Recorded motherload: ${motherload} ORB (Round ${roundId || 'N/A'})`);
}

/**
 * Get motherload history for a time period
 */
export async function getMotherloadHistory(
  limit: number = 100,
  startTimestamp?: number,
  endTimestamp?: number
): Promise<MotherloadRecord[]> {
  let whereConditions = [];
  let params: any[] = [];

  if (startTimestamp) {
    whereConditions.push('timestamp >= ?');
    params.push(startTimestamp);
  }

  if (endTimestamp) {
    whereConditions.push('timestamp <= ?');
    params.push(endTimestamp);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT id, timestamp, motherload, round_id as roundId
    FROM motherload_history
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  params.push(limit);

  const rows = await allQuery<any>(sql, params);
  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    motherload: row.motherload,
    roundId: row.roundId,
  }));
}

/**
 * Get latest motherload value
 */
export async function getLatestMotherload(): Promise<MotherloadRecord | null> {
  const sql = `
    SELECT id, timestamp, motherload, round_id as roundId
    FROM motherload_history
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const row = await getQuery<any>(sql);
  if (!row) return null;

  return {
    id: row.id,
    timestamp: row.timestamp,
    motherload: row.motherload,
    roundId: row.roundId,
  };
}

/**
 * Get motherload statistics for a time period
 */
export async function getMotherloadStats(
  startTimestamp?: number,
  endTimestamp?: number
): Promise<{
  min: number;
  max: number;
  avg: number;
  current: number;
  count: number;
}> {
  let whereConditions = [];
  let params: any[] = [];

  if (startTimestamp) {
    whereConditions.push('timestamp >= ?');
    params.push(startTimestamp);
  }

  if (endTimestamp) {
    whereConditions.push('timestamp <= ?');
    params.push(endTimestamp);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      MIN(motherload) as min,
      MAX(motherload) as max,
      AVG(motherload) as avg,
      COUNT(*) as count
    FROM motherload_history
    ${whereClause}
  `;

  const stats = await getQuery<{
    min: number;
    max: number;
    avg: number;
    count: number;
  }>(sql, params);

  const latest = await getLatestMotherload();

  return {
    min: stats?.min || 0,
    max: stats?.max || 0,
    avg: stats?.avg || 0,
    current: latest?.motherload || 0,
    count: stats?.count || 0,
  };
}
