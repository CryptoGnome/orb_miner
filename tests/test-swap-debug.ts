import { initializeDatabase, allQuery } from '../src/utils/database';
import { loadAndCacheConfig, config } from '../src/utils/config';
import { getBalances } from '../src/utils/wallet';
import { getOrbPrice } from '../src/utils/jupiter';

/**
 * Debug script to check why swaps are not happening
 * Run with: npx ts-node tests/test-swap-debug.ts
 */

async function main() {
  console.log('============================================================');
  console.log('Swap Debug - Checking Why Swaps Are Not Happening');
  console.log('============================================================\n');

  try {
    // Initialize database
    await initializeDatabase();

    // Load configuration
    console.log('📋 Loading configuration from database...');
    await loadAndCacheConfig();

    console.log('\n🔧 SWAP CONFIGURATION:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`AUTO_SWAP_ENABLED: ${config.autoSwapEnabled}`);
    console.log(`WALLET_ORB_SWAP_THRESHOLD: ${config.walletOrbSwapThreshold} ORB`);
    console.log(`MIN_ORB_TO_KEEP: ${config.minOrbToKeep} ORB`);
    console.log(`MIN_ORB_SWAP_AMOUNT: ${config.minOrbSwapAmount} ORB`);
    console.log(`MIN_ORB_PRICE_USD: $${config.minOrbPriceUsd}`);
    console.log(`SLIPPAGE_BPS: ${config.slippageBps} bps`);

    // Get current balances
    console.log('\n💰 CURRENT BALANCES:');
    console.log('─────────────────────────────────────────────────────────');
    const balances = await getBalances();
    console.log(`Wallet SOL: ${balances.sol.toFixed(4)} SOL`);
    console.log(`Wallet ORB: ${balances.orb.toFixed(4)} ORB`);

    // Get current ORB price
    console.log('\n📈 CURRENT ORB PRICE:');
    console.log('─────────────────────────────────────────────────────────');
    const { priceInUsd, priceInSol } = await getOrbPrice();
    console.log(`ORB Price: $${priceInUsd.toFixed(2)} USD (${priceInSol.toFixed(8)} SOL)`);

    // Calculate swap logic
    console.log('\n🔍 SWAP LOGIC ANALYSIS:');
    console.log('─────────────────────────────────────────────────────────');

    const checks = [];
    let canSwap = true;

    // Check 1: Auto-swap enabled
    if (!config.autoSwapEnabled) {
      checks.push('❌ Auto-swap is DISABLED');
      canSwap = false;
    } else {
      checks.push('✅ Auto-swap is enabled');
    }

    // Check 2: ORB balance vs threshold
    if (balances.orb < config.walletOrbSwapThreshold) {
      checks.push(`❌ ORB balance (${balances.orb.toFixed(2)}) < threshold (${config.walletOrbSwapThreshold})`);
      canSwap = false;
    } else {
      checks.push(`✅ ORB balance (${balances.orb.toFixed(2)}) >= threshold (${config.walletOrbSwapThreshold})`);
    }

    // Check 3: Amount to swap after keeping minimum
    const orbToSwap = Math.max(0, balances.orb - config.minOrbToKeep);
    if (orbToSwap < config.minOrbSwapAmount) {
      checks.push(`❌ Amount to swap (${orbToSwap.toFixed(2)}) < minimum (${config.minOrbSwapAmount})`);
      checks.push(`   (Balance: ${balances.orb.toFixed(2)} - Keep: ${config.minOrbToKeep} = ${orbToSwap.toFixed(2)})`);
      canSwap = false;
    } else {
      checks.push(`✅ Amount to swap (${orbToSwap.toFixed(2)}) >= minimum (${config.minOrbSwapAmount})`);
    }

    // Check 4: ORB price vs minimum
    if (config.minOrbPriceUsd > 0 && priceInUsd < config.minOrbPriceUsd) {
      checks.push(`❌ ORB price ($${priceInUsd.toFixed(2)}) < minimum ($${config.minOrbPriceUsd.toFixed(2)})`);
      canSwap = false;
    } else if (config.minOrbPriceUsd > 0) {
      checks.push(`✅ ORB price ($${priceInUsd.toFixed(2)}) >= minimum ($${config.minOrbPriceUsd.toFixed(2)})`);
    } else {
      checks.push(`ℹ️  No minimum price check (MIN_ORB_PRICE_USD = 0)`);
    }

    checks.forEach(check => console.log(check));

    console.log('\n📊 RESULT:');
    console.log('─────────────────────────────────────────────────────────');
    if (canSwap) {
      console.log(`✅ ALL CHECKS PASSED - Swap should be happening!`);
      console.log(`   Would swap: ${orbToSwap.toFixed(2)} ORB → ~${(orbToSwap * priceInSol).toFixed(4)} SOL`);
    } else {
      console.log('❌ SWAP BLOCKED - One or more conditions not met');
    }

    // Check recent swap transactions
    console.log('\n📜 RECENT SWAP TRANSACTIONS:');
    console.log('─────────────────────────────────────────────────────────');
    const recentSwaps = await allQuery(
      `SELECT * FROM transactions WHERE type = 'swap' ORDER BY timestamp DESC LIMIT 5`,
      []
    );

    if (recentSwaps.length === 0) {
      console.log('No swap transactions found in database');
    } else {
      recentSwaps.forEach((swap: any) => {
        const date = new Date(swap.timestamp).toLocaleString();
        console.log(`${date}: ${swap.orbAmount?.toFixed(2)} ORB → ${swap.solAmount?.toFixed(4)} SOL [${swap.status}]`);
      });
    }

    console.log('\n✅ Debug complete');
  } catch (error) {
    console.error('\n❌ Debug failed:', error);
    process.exit(1);
  }
}

main();
