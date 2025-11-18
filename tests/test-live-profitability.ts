import { fetchBoard, fetchRound, fetchTreasury } from '../src/utils/accounts';
import { getOrbPrice } from '../src/utils/jupiter';
import { config } from '../src/utils/config';

/**
 * Test the NEW profitability calculation with LIVE Round data
 * This simulates what the bot now does automatically
 */
async function testLiveProfitability() {
  console.log('🎯 LIVE Profitability Check (as bot sees it)\n');
  console.log('This shows REAL-TIME competition data from the blockchain\n');

  // Get current board
  const board = await fetchBoard();
  console.log(`📍 Current Round: ${board.roundId.toString()}\n`);

  // Fetch Round to get ACTUAL competition
  let currentRound;
  try {
    currentRound = await fetchRound(board.roundId);
    const totalDeployedSol = Number(currentRound.totalDeployed) / 1e9;
    console.log(`🏁 REAL Competition (from Round account):`);
    console.log(`   Total Deployed by ALL Miners: ${totalDeployedSol.toFixed(4)} SOL\n`);
  } catch (error) {
    console.log('⚠️  Could not fetch round data (may have just started)\n');
    currentRound = null;
  }

  // Get motherload
  const treasury = await fetchTreasury();
  const motherloadOrb = Number(treasury.motherlode) / 1e9;
  console.log(`💎 Motherload: ${motherloadOrb.toFixed(2)} ORB\n`);

  // Get ORB price
  const { priceInSol, priceInUsd } = await getOrbPrice();
  console.log(`📊 ORB Price: ${priceInSol.toFixed(6)} SOL ($${priceInUsd.toFixed(2)})\n`);

  // Your deployment (example)
  const yourDeploymentPerRound = 0.1828; // SOL

  // Calculate profitability (mimicking bot's logic)
  let yourShareOfTotal: number;
  let competitionMultiplier: number;
  let competitionSource: string;

  if (currentRound && currentRound.totalDeployed) {
    const totalDeployedSol = Number(currentRound.totalDeployed) / 1e9;

    if (totalDeployedSol < 0.01) {
      // Round just started, use estimate
      competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
      yourShareOfTotal = 1 / (competitionMultiplier + 1);
      competitionSource = `estimate (${competitionMultiplier}x) - round just started`;
    } else {
      // Use REAL data
      yourShareOfTotal = yourDeploymentPerRound / (totalDeployedSol + yourDeploymentPerRound);
      competitionMultiplier = totalDeployedSol / yourDeploymentPerRound;
      competitionSource = `REAL on-chain data (${competitionMultiplier.toFixed(1)}x)`;
    }
  } else {
    // Round data unavailable, use estimate
    competitionMultiplier = config.estimatedCompetitionMultiplier || 10;
    yourShareOfTotal = 1 / (competitionMultiplier + 1);
    competitionSource = `estimate (${competitionMultiplier}x) - Round data unavailable`;
  }

  console.log(`🎯 Your Deployment: ${yourDeploymentPerRound.toFixed(4)} SOL/round\n`);
  console.log(`📊 Competition Analysis:`);
  console.log(`   Source: ${competitionSource}`);
  console.log(`   Your Share of Total: ${(yourShareOfTotal * 100).toFixed(2)}%\n`);

  // Calculate expected rewards
  const baseRewardExpected = yourShareOfTotal * 4;
  const motherloadChance = 1 / 625;
  const motherloadExpected = motherloadChance * yourShareOfTotal * motherloadOrb;
  const expectedOrbRewards = (baseRewardExpected + motherloadExpected) * 0.9;
  const expectedSolBack = yourDeploymentPerRound * 0.95;

  const orbRewardValueInSol = expectedOrbRewards * priceInSol;
  const totalExpectedReturns = orbRewardValueInSol + expectedSolBack;
  const expectedValue = totalExpectedReturns - yourDeploymentPerRound;
  const roi = (expectedValue / yourDeploymentPerRound) * 100;

  const profitable = expectedValue >= 0;

  console.log(`💰 Profitability Calculation:\n`);
  console.log(`   Production Cost: ${yourDeploymentPerRound.toFixed(6)} SOL`);
  console.log(`   Expected ORB: ${expectedOrbRewards.toFixed(6)} ORB`);
  console.log(`   ORB Value: ${expectedOrbRewards.toFixed(6)} × ${priceInSol.toFixed(6)} = ${orbRewardValueInSol.toFixed(6)} SOL`);
  console.log(`   Expected SOL Back: ${expectedSolBack.toFixed(6)} SOL`);
  console.log(`   Total Returns: ${totalExpectedReturns.toFixed(6)} SOL`);
  console.log(`   Expected Value: ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`);
  console.log(`   ROI: ${roi.toFixed(2)}%\n`);

  if (profitable) {
    console.log(`✅ PROFITABLE - Bot will mine! 🎉\n`);
  } else {
    console.log(`❌ UNPROFITABLE - Bot will wait for better conditions! ⚠️\n`);
  }

  // Show comparison
  console.log(`⚖️  Accuracy Improvement:\n`);
  console.log(`   OLD Method: Uses config estimate (${config.estimatedCompetitionMultiplier}x)`);
  console.log(`   NEW Method: Uses ${competitionSource}`);

  if (currentRound && Number(currentRound.totalDeployed) / 1e9 >= 0.01) {
    const estimatedShare = 1 / (config.estimatedCompetitionMultiplier + 1);
    const estimatedEV = (
      ((estimatedShare * 4 + (1/625) * estimatedShare * motherloadOrb) * 0.9 * priceInSol) +
      (yourDeploymentPerRound * 0.95) -
      yourDeploymentPerRound
    );

    console.log(`\n   OLD EV (estimate): ${estimatedEV >= 0 ? '+' : ''}${estimatedEV.toFixed(6)} SOL`);
    console.log(`   NEW EV (actual):   ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(6)} SOL`);
    console.log(`   Difference: ${Math.abs(estimatedEV - expectedValue).toFixed(6)} SOL`);

    if (Math.abs(estimatedEV - expectedValue) > 0.001) {
      console.log(`   ⚠️  Significant difference - real-time data is CRITICAL! ✅`);
    } else {
      console.log(`   ✅ Your estimate was close, but real data is always better!`);
    }
  }

  console.log(`\n🤖 Bot Status: ${config.enableProductionCostCheck ? 'Price-based mining ENABLED ✅' : 'Price-based mining DISABLED ⚠️'}`);
}

testLiveProfitability().catch(console.error);
