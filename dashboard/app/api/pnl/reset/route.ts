import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getWallet, getBalances } from '@bot/utils/wallet';
import { getConnection } from '@bot/utils/solana';
import { getAutomationPDA, fetchMiner, fetchStake } from '@bot/utils/accounts';
import { getOrbPrice } from '@bot/utils/jupiter';
import { initializeDatabase, recordTransaction, allQuery, runQuery, closeDatabase, setBaselineBalance } from '@bot/utils/database';
import { loadAndCacheConfig } from '@bot/utils/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_PATH = path.join(process.cwd(), '..', 'data', 'orb_mining.db');
const BACKUP_DIR = path.join(process.cwd(), '..', 'data', 'backups');
const MAINTENANCE_FILE = path.join(process.cwd(), '..', 'data', '.maintenance');

async function getAutomationInfo() {
  const connection = getConnection();
  const [automationPDA] = getAutomationPDA(getWallet().publicKey);
  const accountInfo = await connection.getAccountInfo(automationPDA);

  if (!accountInfo || accountInfo.data.length < 112) {
    return { exists: false, balance: 0 };
  }

  const data = accountInfo.data;
  const balance = data.readBigUInt64LE(48);

  return {
    exists: true,
    balance: Number(balance) / 1e9,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recordAsBaseline } = body;

    // Check if database exists
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json(
        { error: 'No database file found. Nothing to reset.' },
        { status: 400 }
      );
    }

    // Create maintenance file to signal bot to pause (file-based, not database-based)
    console.log('Creating maintenance file to signal bot...');
    fs.writeFileSync(MAINTENANCE_FILE, `Database reset in progress at ${new Date().toISOString()}`);

    // Initialize database to backup settings
    await initializeDatabase();

    // Backup ALL settings (including encrypted values)
    const backupSettings = await allQuery<{
      key: string;
      value: string;
      type: string;
      description: string
    }>('SELECT key, value, type, description FROM settings');

    await loadAndCacheConfig();

    // Close dashboard's database connection
    await closeDatabase();

    // Close again to be absolutely sure (in case of connection pooling)
    await closeDatabase();

    // Give the bot time to see the file and close its database connection
    // Bot checks the file every ~2 seconds when it's in the main loop
    // Account for worst case: bot could be sleeping for up to 10 seconds (checkInterval)
    console.log('Waiting for bot to detect maintenance file and close database (15 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Wait longer for Windows to release the file handle
    console.log('Waiting for Windows to release file handles (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // One final close attempt to catch any lingering connections
    try {
      await closeDatabase();
      console.log('Final database close completed');
    } catch (err) {
      // Already closed, that's fine
      console.log('Database already closed (expected)');
    }

    // Try to delete the old database file
    // If it fails (OneDrive lock), rename it instead
    // If both fail, we'll do an in-place reset by deleting all data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let backupPath = `Settings backed up in memory at ${timestamp}`;
    let needsInPlaceReset = false;

    try {
      console.log('Attempting to delete old database file...');
      fs.unlinkSync(DB_PATH);
      console.log(`✅ Old database deleted`);
    } catch (deleteError: any) {
      if (deleteError.code === 'EBUSY') {
        // File is locked (likely by OneDrive) - rename it instead
        const oldPath = path.join(path.dirname(DB_PATH), `orb_mining_old_${timestamp}.db`);
        try {
          console.log('⚠️ Delete failed (file locked by OneDrive?) - trying rename...');
          fs.renameSync(DB_PATH, oldPath);
          backupPath = oldPath;
          console.log(`✅ Old database renamed to: ${path.basename(oldPath)}`);
        } catch (renameError: any) {
          // Both delete and rename failed - need to do in-place reset
          console.log('⚠️ Could not delete or rename old database (OneDrive lock)');
          console.log('Will perform in-place reset by deleting all transaction data');
          backupPath = `In-place reset (OneDrive locked file) - settings backed up at ${timestamp}`;
          needsInPlaceReset = true;
        }
      } else {
        throw deleteError; // Re-throw if it's not an EBUSY error
      }
    }

    // Now initialize bot utilities (AFTER deletion attempt)
    await ensureBotInitialized();

    // If file operations failed, do in-place reset by deleting all data
    if (needsInPlaceReset) {
      console.log('Performing in-place reset - deleting all transaction data...');
      await runQuery('DELETE FROM transactions');
      await runQuery('DELETE FROM rounds');
      await runQuery('DELETE FROM balances');
      await runQuery('DELETE FROM prices');
      await runQuery('DELETE FROM motherload_history');
      await runQuery('DELETE FROM in_flight_deployments');
      console.log('✅ All transaction data deleted');
    }

    // Get current on-chain state
    const wallet = getWallet();
    const automationInfo = await getAutomationInfo();
    const minerData = await fetchMiner(wallet.publicKey);
    const balances = await getBalances(wallet.publicKey);

    const currentState = {
      automationBalance: automationInfo.balance,
      claimableSol: minerData ? Number(minerData.rewardsSol) / 1e9 : 0,
      claimableOrb: minerData ? Number(minerData.rewardsOre) / 1e9 : 0,
      walletOrb: balances.orb,
    };

    // Reinitialize database
    await initializeDatabase();

    // Restore all settings from backup
    for (const setting of backupSettings) {
      await runQuery(
        `INSERT INTO settings (key, value, type, description, updated_at)
         VALUES (?, ?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           type = excluded.type,
           description = excluded.description,
           updated_at = strftime('%s', 'now')`,
        [setting.key, setting.value, setting.type, setting.description]
      );
    }

    // Set baseline to current total value (all assets) if requested
    if (recordAsBaseline) {
      // Get ORB price to value ORB holdings
      const { priceInSol: orbPriceSol } = await getOrbPrice();

      // Get staked ORB
      const stakeAccount = await fetchStake(wallet.publicKey).catch(() => null);
      const stakedOrb = stakeAccount ? Number(stakeAccount.balance) / 1e9 : 0;

      // Calculate total starting value INCLUDING all assets
      const totalSol = balances.sol + automationInfo.balance + currentState.claimableSol;
      const totalOrb = balances.orb + currentState.claimableOrb + stakedOrb;
      const orbValueInSol = totalOrb * orbPriceSol;
      const totalStartingValue = totalSol + orbValueInSol;

      // Set baseline balance (this is what PnL calculations use)
      await setBaselineBalance(totalStartingValue);

      console.log(`✅ Baseline set: ${totalStartingValue.toFixed(4)} SOL`);
      console.log(`   - Total SOL: ${totalSol.toFixed(4)} (wallet: ${balances.sol.toFixed(4)}, automation: ${automationInfo.balance.toFixed(4)}, claimable: ${currentState.claimableSol.toFixed(4)})`);
      console.log(`   - Total ORB: ${totalOrb.toFixed(4)} = ${orbValueInSol.toFixed(4)} SOL (wallet: ${balances.orb.toFixed(4)}, claimable: ${currentState.claimableOrb.toFixed(4)}, staked: ${stakedOrb.toFixed(4)})`);

      // Also record as transaction for history
      await recordTransaction({
        type: 'automation_setup',
        signature: 'MANUAL_RESET_BASELINE',
        roundId: undefined,
        solAmount: automationInfo.balance,
        orbAmount: 0,
        status: 'success',
        notes: `PnL reset - baseline set to ${totalStartingValue.toFixed(4)} SOL (total value of all assets)`,
      });
    }

    // Remove maintenance file to signal bot that reset is complete
    if (fs.existsSync(MAINTENANCE_FILE)) {
      fs.unlinkSync(MAINTENANCE_FILE);
    }
    console.log('✅ Maintenance file removed - bot will resume automatically');

    return NextResponse.json({
      success: true,
      backupPath,
      currentState,
      baselineRecorded: recordAsBaseline && automationInfo.exists && automationInfo.balance > 0,
    });
  } catch (error: any) {
    console.error('PnL reset failed:', error);

    // Make sure to remove maintenance file even if reset fails
    try {
      if (fs.existsSync(MAINTENANCE_FILE)) {
        fs.unlinkSync(MAINTENANCE_FILE);
      }
      console.log('✅ Maintenance file removed after error - bot will resume');
    } catch (cleanupError) {
      console.error('Failed to remove maintenance file:', cleanupError);
    }

    // Provide helpful error message for EBUSY errors
    let errorMessage = error.message || 'Failed to reset PnL';
    if (error.code === 'EBUSY') {
      errorMessage = 'Database is still locked. The bot may need more time to pause. Please try again.';
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
