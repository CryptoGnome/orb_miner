/**
 * PnL Reset Tool
 *
 * Resets PnL tracking by clearing the database and optionally starting fresh.
 * Use this when PnL data is corrupted or you want to start tracking from scratch.
 *
 * WARNING: This deletes all historical transaction data!
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { getWallet, getBalances } from "../src/utils/wallet";
import { getConnection } from "../src/utils/solana";
import {
  getAutomationPDA,
  fetchMiner,
} from "../src/utils/accounts";
import { initializeDatabase, recordTransaction } from "../src/utils/database";

const DB_PATH = path.join(process.cwd(), "data", "orb_mining.db");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

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

async function resetPnL() {
  console.log("⚠️  PnL Reset Tool");
  console.log("=================\n");
  console.log("This will DELETE all historical PnL data from the database.");
  console.log("A backup will be created before deletion.\n");

  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.log("❌ No database file found at:", DB_PATH);
    console.log("Nothing to reset. Run the bot first to create the database.");
    return;
  }

  // Confirm deletion
  const confirm1 = await askQuestion(
    "Are you sure you want to reset PnL tracking? (yes/no): "
  );
  if (confirm1.toLowerCase() !== "yes") {
    console.log("❌ Reset cancelled.");
    return;
  }

  const confirm2 = await askQuestion(
    "This will DELETE ALL transaction history. Continue? (yes/no): "
  );
  if (confirm2.toLowerCase() !== "yes") {
    console.log("❌ Reset cancelled.");
    return;
  }

  // Create backup
  console.log("\n📦 Creating backup...");
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `orb_mining_${timestamp}.db`);

  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Backup saved to: ${backupPath}`);

  // Delete database
  console.log("\n🗑️  Deleting database...");
  fs.unlinkSync(DB_PATH);
  console.log("✅ Database deleted");

  // Ask if user wants to record current automation as starting capital
  console.log("\n📊 Checking current on-chain state...");

  const wallet = getWallet();
  const automationInfo = await getAutomationInfo();
  const minerData = await fetchMiner(wallet.publicKey);
  const balances = await getBalances(wallet.publicKey);

  console.log("\nCurrent State:");
  console.log(
    `  Automation Balance: ${automationInfo.balance.toFixed(4)} SOL`
  );
  console.log(
    `  Claimable SOL: ${minerData ? (Number(minerData.rewardsSol) / 1e9).toFixed(4) : '0.0000'} SOL`
  );
  console.log(
    `  Claimable ORB: ${minerData ? (Number(minerData.rewardsOre) / 1e9).toFixed(4) : '0.0000'} ORB`
  );
  console.log(`  Wallet ORB: ${balances.orb.toFixed(4)} ORB`);

  if (automationInfo.exists && automationInfo.balance > 0) {
    console.log("\n💡 You have an active automation account with funds.");
    console.log("Would you like to record this as your starting capital?");
    console.log(
      "This will make future PnL calculations accurate from this point forward.\n"
    );

    const recordCurrent = await askQuestion(
      "Record current automation balance as starting capital? (yes/no): "
    );

    if (recordCurrent.toLowerCase() === "yes") {
      // Reinitialize database
      console.log("\n🔄 Initializing fresh database...");
      await initializeDatabase();

      // Record current automation balance as setup transaction
      await recordTransaction({
        type: "automation_setup",
        signature: "MANUAL_RESET_BASELINE",
        roundId: undefined,
        solAmount: automationInfo.balance,
        orbAmount: 0,
        status: "success",
        notes: `PnL reset - recorded existing automation balance as starting capital`,
      });

      console.log(
        `✅ Recorded ${automationInfo.balance.toFixed(
          4
        )} SOL as starting capital`
      );
      console.log("\n📈 Future PnL will be calculated from this baseline:");
      console.log(
        `   Capital Deployed: ${automationInfo.balance.toFixed(4)} SOL`
      );
      console.log(
        `   All future claims, swaps, and deployments will be tracked from this point`
      );
    } else {
      // Just initialize empty database
      console.log("\n🔄 Initializing fresh database...");
      await initializeDatabase();
      console.log("✅ Fresh database created");
      console.log("\n💡 PnL tracking will start from 0 on next bot run");
    }
  } else {
    // No automation exists, just initialize empty
    console.log("\n🔄 Initializing fresh database...");
    await initializeDatabase();
    console.log("✅ Fresh database created");
    console.log("\n💡 PnL tracking will start from 0 on next bot run");
  }

  console.log("\n✅ Reset complete!");
  console.log("\nNext steps:");
  console.log("  1. Run the bot normally: npm start");
  console.log("  2. PnL will be tracked accurately from this point forward");
  console.log(`  3. Old data is backed up at: ${backupPath}`);
}

resetPnL()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Reset failed:", error);
    process.exit(1);
  });
