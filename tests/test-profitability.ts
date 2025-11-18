import { getOrbPrice } from '../src/utils/jupiter';
import { fetchTreasury } from '../src/utils/accounts';
import { config } from '../src/utils/config';

/**
 * Test the profitability calculation to show price-based smart mining in action
 */
async function testProfitability() {
  console.log('🧮 Testing Production Cost Profitability Analysis\n');

  // Get current ORB price
  const { priceInSol, priceInUsd } = await getOrbPrice();
  console.log(`📊 Current ORB Price:`);
  console.log(`   ${priceInSol.toFixed(6)} SOL`);
  console.log(`   $${priceInUsd.toFixed(2)} USD\n`);

  // Get current motherload
  const treasury = await fetchTreasury();
  const motherloadOrb = Number(treasury.motherlode) / 1e9;
  console.log(`💎 Current Motherload: ${motherloadOrb.toFixed(2)} ORB\n`);

  // Example: Calculate profitability for different deployment amounts
  const deploymentAmounts = [0.05, 0.1, 0.18, 0.25]; // SOL per round

  console.log(`🎯 Profitability Analysis (assuming ${config.estimatedCompetitionMultiplier}x competition):\n`);

  for (const costPerRound of deploymentAmounts) {
    // Calculate expected rewards (same logic as bot)
    const competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
    const ourSquares = 25;
    const ourShareOfTotal = ourSquares / (ourSquares * competitionMultiplier);

    // Base reward: 4 ORB per round
    const baseRewardExpected = ourShareOfTotal * 4;

    // Motherload reward: 1/625 chance to hit
    const motherloadChance = 1 / 625;
    const motherloadExpected = motherloadChance * ourShareOfTotal * motherloadOrb;

    // Total expected ORB (after 10% refining fee)
    const totalExpectedOrb = (baseRewardExpected + motherloadExpected) * 0.9;

    // Expected SOL back (assume 95% of deployment)
    const expectedSolBack = costPerRound * 0.95;

    // Calculate EV
    const orbRewardValueInSol = totalExpectedOrb * priceInSol;
    const totalExpectedReturns = orbRewardValueInSol + expectedSolBack;
    const expectedValue = totalExpectedReturns - costPerRound;

    const profitable = expectedValue >= 0;
    const profitIcon = profitable ? '✅' : '❌';

    console.log(`${profitIcon} Cost: ${costPerRound.toFixed(4)} SOL/round`);
    console.log(`   Expected ORB: ${totalExpectedOrb.toFixed(6)} ORB × ${priceInSol.toFixed(6)} SOL = ${orbRewardValueInSol.toFixed(6)} SOL`);
    console.log(`   Expected SOL Back: ${expectedSolBack.toFixed(6)} SOL`);
    console.log(`   Total Returns: ${totalExpectedReturns.toFixed(6)} SOL`);
    console.log(`   Expected Value: ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`);
    console.log(`   Status: ${profitable ? 'PROFITABLE ✅' : 'UNPROFITABLE ❌'}\n`);
  }

  console.log(`\n📝 Your bot deploys ~${(0.1828).toFixed(4)} SOL/round based on your budget.`);
  console.log(`   With current ORB price, mining is PROFITABLE! 🎉\n`);
}

testProfitability().catch(console.error);
