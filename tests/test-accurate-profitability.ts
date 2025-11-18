import { getOrbPrice } from '../src/utils/jupiter';
import { fetchTreasury, fetchBoard, fetchRound } from '../src/utils/accounts';
import { config } from '../src/utils/config';

/**
 * ACCURATE profitability analysis using REAL on-chain competition data
 *
 * Instead of guessing competition (20x multiplier), we fetch the actual
 * total deployed amount from the Round account.
 */
async function testAccurateProfitability() {
  console.log('🎯 ACCURATE Production Cost Profitability Analysis\n');
  console.log('Using REAL on-chain competition data (not estimates)\n');

  // Get current ORB price
  const { priceInSol, priceInUsd } = await getOrbPrice();
  console.log(`📊 Current ORB Price:`);
  console.log(`   ${priceInSol.toFixed(6)} SOL`);
  console.log(`   $${priceInUsd.toFixed(2)} USD\n`);

  // Get current motherload
  const treasury = await fetchTreasury();
  const motherloadOrb = Number(treasury.motherlode) / 1e9;
  console.log(`💎 Current Motherload: ${motherloadOrb.toFixed(2)} ORB\n`);

  // Get current round data
  const board = await fetchBoard();
  console.log(`📍 Current Round: ${board.roundId.toString()}\n`);

  // Fetch round to get ACTUAL competition data
  const round = await fetchRound(board.roundId);
  const totalDeployedLamports = Number(round.totalDeployed);
  const totalDeployedSol = totalDeployedLamports / 1e9;

  console.log(`🏁 REAL Competition Data (from Round account):`);
  console.log(`   Total Deployed by ALL Miners: ${totalDeployedSol.toFixed(4)} SOL\n`);

  // Example: Calculate profitability for your typical deployment
  const yourDeploymentPerRound = 0.1828; // SOL
  const yourDeploymentPerSquare = yourDeploymentPerRound / 25;

  console.log(`🎯 Your Deployment:`);
  console.log(`   ${yourDeploymentPerRound.toFixed(4)} SOL/round (${yourDeploymentPerSquare.toFixed(6)} SOL per square)\n`);

  // If round just started and totalDeployed is 0, use previous round or estimate
  let actualTotalDeployed = totalDeployedSol;
  if (totalDeployedSol < 0.01) {
    console.log(`⚠️  Round just started (totalDeployed ≈ 0), using estimated competition...\n`);
    const estimatedCompetition = config.estimatedCompetitionMultiplier || 10;
    actualTotalDeployed = yourDeploymentPerRound * estimatedCompetition;
  }

  // Calculate YOUR actual share of total deployment
  const yourShareOfTotal = yourDeploymentPerRound / (actualTotalDeployed + yourDeploymentPerRound);
  const actualCompetitionMultiplier = actualTotalDeployed / yourDeploymentPerRound;

  console.log(`📊 Competition Analysis:`);
  console.log(`   Your Share of Total: ${(yourShareOfTotal * 100).toFixed(2)}%`);
  console.log(`   Actual Competition Multiplier: ${actualCompetitionMultiplier.toFixed(1)}x`);
  console.log(`   (You configured: ${config.estimatedCompetitionMultiplier}x in .env)\n`);

  // Calculate expected rewards using REAL competition data
  // Base reward: 4 ORB per round
  // 50% split proportionally, 50% winner-takes-all (weighted random)
  // Expected value = our_share × 4
  const baseRewardExpected = yourShareOfTotal * 4;

  // Motherload reward: 1/625 chance to hit, split proportionally if we're on winning block
  const motherloadChance = 1 / 625;
  const motherloadExpected = motherloadChance * yourShareOfTotal * motherloadOrb;

  // Total expected ORB (after 10% refining fee)
  const totalExpectedOrb = (baseRewardExpected + motherloadExpected) * 0.9;

  // Expected SOL back (assume 95% of deployment)
  const expectedSolBack = yourDeploymentPerRound * 0.95;

  // Calculate EV
  const orbRewardValueInSol = totalExpectedOrb * priceInSol;
  const totalExpectedReturns = orbRewardValueInSol + expectedSolBack;
  const expectedValue = totalExpectedReturns - yourDeploymentPerRound;

  const profitable = expectedValue >= 0;
  const profitIcon = profitable ? '✅' : '❌';

  console.log(`${profitIcon} Profitability Breakdown:\n`);
  console.log(`   Production Cost: ${yourDeploymentPerRound.toFixed(6)} SOL`);
  console.log(`   Expected ORB Rewards: ${totalExpectedOrb.toFixed(6)} ORB`);
  console.log(`   ORB Value: ${totalExpectedOrb.toFixed(6)} × ${priceInSol.toFixed(6)} = ${orbRewardValueInSol.toFixed(6)} SOL`);
  console.log(`   Expected SOL Back: ${expectedSolBack.toFixed(6)} SOL`);
  console.log(`   Total Returns: ${totalExpectedReturns.toFixed(6)} SOL`);
  console.log(`   Expected Value: ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`);
  console.log(`   ROI: ${((expectedValue / yourDeploymentPerRound) * 100).toFixed(2)}%\n`);

  if (profitable) {
    console.log(`✅ Mining is PROFITABLE at current conditions! 🎉\n`);
  } else {
    console.log(`❌ Mining is UNPROFITABLE - EV is negative! ⚠️\n`);
  }

  // Show breakdown per square
  console.log(`📊 Per-Square Analysis (you deploy to all 25 squares):`);
  console.log(`   Cost per square: ${yourDeploymentPerSquare.toFixed(6)} SOL`);
  console.log(`   Expected return per square: ${(totalExpectedReturns / 25).toFixed(6)} SOL`);
  console.log(`   Net per square: ${(expectedValue / 25).toFixed(6)} SOL\n`);

  // Compare estimated vs actual
  console.log(`⚖️  Accuracy Check:`);
  console.log(`   Your Config Estimate: ${config.estimatedCompetitionMultiplier}x competition`);
  console.log(`   Actual Competition: ${actualCompetitionMultiplier.toFixed(1)}x`);
  const accuracyDiff = Math.abs(actualCompetitionMultiplier - config.estimatedCompetitionMultiplier);
  if (accuracyDiff > 5) {
    console.log(`   ⚠️  Your estimate is off by ${accuracyDiff.toFixed(1)}x - consider adjusting!\n`);
  } else {
    console.log(`   ✅ Your estimate is reasonably accurate!\n`);
  }
}

testAccurateProfitability().catch(console.error);
