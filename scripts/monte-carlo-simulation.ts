/**
 * Monte Carlo Simulation for ORB Mining Strategy Optimization
 *
 * Simulates thousands of mining rounds with different tier configurations
 * to find the optimal conservative strategy that maximizes expected value
 * while minimizing risk of ruin.
 *
 * Usage: npx ts-node scripts/monte-carlo-simulation.ts
 */

interface SimulationConfig {
  name: string;
  // Maps motherload range to number of rounds
  tiers: { minOrb: number; maxOrb: number; rounds: number }[];
}

interface SimulationResult {
  config: SimulationConfig;
  motherloadLevel: number;
  totalSimulations: number;
  winCount: number;
  winRate: number;
  avgProfit: number;
  avgROI: number;
  maxDrawdown: number;
  riskOfRuin: number;
  profitability: number; // % of simulations that ended positive
  expectedValue: number;
}

// ORB Mining Mechanics Constants
const SQUARES_PER_ROUND = 25;
const TOTAL_POSSIBLE_WINNERS = 625; // 25 squares × 25 positions
const BASE_ORB_REWARD = 4; // ORB distributed per round
const REFINING_FEE = 0.1; // 10% fee on ORB rewards
const SOL_RETURN_RATE = 0.95; // 95% of SOL returned on losses
const LAMPORTS_PER_SOL = 1e9;

/**
 * Simulate a single mining round
 */
function simulateRound(
  deploymentSol: number,
  motherloadOrb: number,
  competition: number // How many other miners (in SOL equivalent)
): { won: boolean; solReturned: number; orbReward: number } {
  const totalDeployment = deploymentSol + competition;
  const yourShare = deploymentSol / totalDeployment;

  // 1 in 625 chance to win (independent for each round)
  const wonMotherload = Math.random() < (1 / TOTAL_POSSIBLE_WINNERS);

  if (wonMotherload) {
    // You won! Get proportional share of motherload + base reward
    const motherloadShare = motherloadOrb * yourShare;
    const baseRewardShare = BASE_ORB_REWARD * yourShare;
    const totalOrbReward = (motherloadShare + baseRewardShare) * (1 - REFINING_FEE);

    // Get 95% of your SOL back
    const solReturned = deploymentSol * SOL_RETURN_RATE;

    return { won: true, solReturned, orbReward: totalOrbReward };
  } else {
    // Lost - get 95% SOL back, no ORB
    return { won: false, solReturned: deploymentSol * SOL_RETURN_RATE, orbReward: 0 };
  }
}

/**
 * Calculate deployment amount for a given motherload and tier config
 */
function calculateDeploymentAmount(
  motherloadOrb: number,
  config: SimulationConfig,
  totalBudget: number
): number {
  // Find matching tier
  const tier = config.tiers.find(
    t => motherloadOrb >= t.minOrb && motherloadOrb <= t.maxOrb
  );

  if (!tier) {
    // Default to most conservative
    const mostConservative = config.tiers[config.tiers.length - 1];
    return totalBudget / (mostConservative.rounds * SQUARES_PER_ROUND);
  }

  // Calculate SOL per square based on tier rounds
  return totalBudget / (tier.rounds * SQUARES_PER_ROUND);
}

/**
 * Run Monte Carlo simulation for a specific configuration
 */
function runSimulation(
  config: SimulationConfig,
  motherloadOrb: number,
  initialBudget: number,
  numSimulations: number,
  competition: number,
  orbPriceInSol: number
): SimulationResult {
  let winCount = 0;
  let totalProfit = 0;
  let profitableSimulations = 0;
  let maxDrawdownSum = 0;
  let ruinCount = 0;

  const solPerRound = calculateDeploymentAmount(motherloadOrb, config, initialBudget);

  for (let sim = 0; sim < numSimulations; sim++) {
    let budget = initialBudget;
    let totalOrbEarned = 0;
    let maxBudget = initialBudget;
    let minBudget = initialBudget;
    let roundsPlayed = 0;

    // Calculate how many rounds we can play with this budget
    const tier = config.tiers.find(
      t => motherloadOrb >= t.minOrb && motherloadOrb <= t.maxOrb
    );
    const maxRounds = tier ? tier.rounds : config.tiers[config.tiers.length - 1].rounds;

    // Simulate rounds until budget depleted or max rounds reached
    while (budget >= solPerRound && roundsPlayed < maxRounds) {
      const result = simulateRound(solPerRound, motherloadOrb, competition);

      // Update budget and ORB
      budget = budget - solPerRound + result.solReturned;
      totalOrbEarned += result.orbReward;

      if (result.won) {
        winCount++;
      }

      // Track max/min for drawdown calculation
      if (budget > maxBudget) maxBudget = budget;
      if (budget < minBudget) minBudget = budget;

      roundsPlayed++;
    }

    // Calculate final value (remaining SOL + ORB value)
    const orbValueInSol = totalOrbEarned * orbPriceInSol;
    const finalValue = budget + orbValueInSol;
    const profit = finalValue - initialBudget;

    totalProfit += profit;
    if (profit > 0) profitableSimulations++;

    // Calculate drawdown for this simulation
    const drawdown = (maxBudget - minBudget) / maxBudget;
    maxDrawdownSum += drawdown;

    // Risk of ruin: lost more than 80% of capital
    if (finalValue < initialBudget * 0.2) {
      ruinCount++;
    }
  }

  const avgProfit = totalProfit / numSimulations;
  const avgROI = (avgProfit / initialBudget) * 100;
  const winRate = (winCount / numSimulations) / (config.tiers[0]?.rounds || 100);
  const maxDrawdown = (maxDrawdownSum / numSimulations) * 100;
  const riskOfRuin = (ruinCount / numSimulations) * 100;
  const profitability = (profitableSimulations / numSimulations) * 100;

  return {
    config,
    motherloadLevel: motherloadOrb,
    totalSimulations: numSimulations,
    winCount,
    winRate: winRate * 100,
    avgProfit,
    avgROI,
    maxDrawdown,
    riskOfRuin,
    profitability,
    expectedValue: avgProfit,
  };
}

/**
 * Strategy configurations to test
 */
const strategies: SimulationConfig[] = [
  {
    name: 'CURRENT (Highly Conservative)',
    tiers: [
      { minOrb: 1200, maxOrb: 99999, rounds: 30 },
      { minOrb: 1100, maxOrb: 1199, rounds: 45 },
      { minOrb: 1000, maxOrb: 1099, rounds: 60 },
      { minOrb: 900, maxOrb: 999, rounds: 80 },
      { minOrb: 800, maxOrb: 899, rounds: 100 },
      { minOrb: 700, maxOrb: 799, rounds: 120 },
      { minOrb: 600, maxOrb: 699, rounds: 140 },
      { minOrb: 500, maxOrb: 599, rounds: 160 },
      { minOrb: 400, maxOrb: 499, rounds: 180 },
      { minOrb: 300, maxOrb: 399, rounds: 200 },
      { minOrb: 200, maxOrb: 299, rounds: 220 },
      { minOrb: 0, maxOrb: 199, rounds: 440 },
    ],
  },
  {
    name: 'MORE CONSERVATIVE (+25% rounds)',
    tiers: [
      { minOrb: 1200, maxOrb: 99999, rounds: 38 },
      { minOrb: 1100, maxOrb: 1199, rounds: 56 },
      { minOrb: 1000, maxOrb: 1099, rounds: 75 },
      { minOrb: 900, maxOrb: 999, rounds: 100 },
      { minOrb: 800, maxOrb: 899, rounds: 125 },
      { minOrb: 700, maxOrb: 799, rounds: 150 },
      { minOrb: 600, maxOrb: 699, rounds: 175 },
      { minOrb: 500, maxOrb: 599, rounds: 200 },
      { minOrb: 400, maxOrb: 499, rounds: 225 },
      { minOrb: 300, maxOrb: 399, rounds: 250 },
      { minOrb: 200, maxOrb: 299, rounds: 275 },
      { minOrb: 0, maxOrb: 199, rounds: 550 },
    ],
  },
  {
    name: 'ULTRA CONSERVATIVE (+50% rounds)',
    tiers: [
      { minOrb: 1200, maxOrb: 99999, rounds: 45 },
      { minOrb: 1100, maxOrb: 1199, rounds: 68 },
      { minOrb: 1000, maxOrb: 1099, rounds: 90 },
      { minOrb: 900, maxOrb: 999, rounds: 120 },
      { minOrb: 800, maxOrb: 899, rounds: 150 },
      { minOrb: 700, maxOrb: 799, rounds: 180 },
      { minOrb: 600, maxOrb: 699, rounds: 210 },
      { minOrb: 500, maxOrb: 599, rounds: 240 },
      { minOrb: 400, maxOrb: 499, rounds: 270 },
      { minOrb: 300, maxOrb: 399, rounds: 300 },
      { minOrb: 200, maxOrb: 299, rounds: 330 },
      { minOrb: 0, maxOrb: 199, rounds: 660 },
    ],
  },
  {
    name: 'EXTREME CONSERVATIVE (+100% rounds)',
    tiers: [
      { minOrb: 1200, maxOrb: 99999, rounds: 60 },
      { minOrb: 1100, maxOrb: 1199, rounds: 90 },
      { minOrb: 1000, maxOrb: 1099, rounds: 120 },
      { minOrb: 900, maxOrb: 999, rounds: 160 },
      { minOrb: 800, maxOrb: 899, rounds: 200 },
      { minOrb: 700, maxOrb: 799, rounds: 240 },
      { minOrb: 600, maxOrb: 699, rounds: 280 },
      { minOrb: 500, maxOrb: 599, rounds: 320 },
      { minOrb: 400, maxOrb: 499, rounds: 360 },
      { minOrb: 300, maxOrb: 399, rounds: 400 },
      { minOrb: 200, maxOrb: 299, rounds: 440 },
      { minOrb: 0, maxOrb: 199, rounds: 880 },
    ],
  },
];

/**
 * Main simulation runner
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     ORB MINING MONTE CARLO SIMULATION - STRATEGY OPTIMIZER    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Simulation parameters
  const numSimulations = 10000; // 10k simulations per test
  const initialBudget = 1.0; // 1 SOL starting budget
  const orbPriceInSol = 0.15; // Assume ORB = 0.15 SOL (~$30 if SOL = $200)
  const competitionMultiplier = 20; // Assume 20x competition

  // Test motherload levels from 0 to 1200+ (every 50 ORB from 0-500, every 100 from 500-1200)
  const motherloadLevels = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200];

  console.log('Simulation Parameters:');
  console.log(`  • Simulations per test: ${numSimulations.toLocaleString()}`);
  console.log(`  • Initial budget: ${initialBudget} SOL`);
  console.log(`  • ORB price: ${orbPriceInSol} SOL (~$${(orbPriceInSol * 200).toFixed(0)})`);
  console.log(`  • Competition: ${competitionMultiplier}x your deployment`);
  console.log(`  • Motherload levels: ${motherloadLevels.join(', ')} ORB`);
  console.log(`  • Testing from 0 ORB to find absolute minimum profitable threshold\n`);

  console.log('Running simulations... (this may take a few minutes)\n');

  // Store all results
  const allResults: SimulationResult[] = [];

  // Run simulations for each strategy and motherload level
  for (const strategy of strategies) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`Testing: ${strategy.name}`);
    console.log('═'.repeat(70));

    for (const motherload of motherloadLevels) {
      const competition = calculateDeploymentAmount(motherload, strategy, initialBudget) * competitionMultiplier;

      const result = runSimulation(
        strategy,
        motherload,
        initialBudget,
        numSimulations,
        competition,
        orbPriceInSol
      );

      allResults.push(result);

      // Print result
      const solPerRound = calculateDeploymentAmount(motherload, strategy, initialBudget);
      console.log(`\nMotherload: ${motherload} ORB (${solPerRound.toFixed(6)} SOL/round)`);
      console.log(`  Win Rate:        ${result.winRate.toFixed(2)}%`);
      console.log(`  Avg ROI:         ${result.avgROI >= 0 ? '+' : ''}${result.avgROI.toFixed(2)}%`);
      console.log(`  Avg Profit:      ${result.avgProfit >= 0 ? '+' : ''}${result.avgProfit.toFixed(6)} SOL`);
      console.log(`  Profitability:   ${result.profitability.toFixed(1)}% end positive`);
      console.log(`  Max Drawdown:    ${result.maxDrawdown.toFixed(1)}%`);
      console.log(`  Risk of Ruin:    ${result.riskOfRuin.toFixed(1)}%`);
    }
  }

  // Analyze and compare results
  console.log('\n\n' + '═'.repeat(70));
  console.log('SUMMARY - BEST STRATEGY BY MOTHERLOAD LEVEL');
  console.log('═'.repeat(70));

  for (const motherload of motherloadLevels) {
    const resultsForLevel = allResults.filter(r => r.motherloadLevel === motherload);

    // Find best by ROI
    const bestByROI = resultsForLevel.reduce((best, current) =>
      current.avgROI > best.avgROI ? current : best
    );

    // Find safest (lowest risk of ruin + highest profitability)
    const safest = resultsForLevel.reduce((best, current) => {
      const currentScore = current.profitability - (current.riskOfRuin * 2);
      const bestScore = best.profitability - (best.riskOfRuin * 2);
      return currentScore > bestScore ? current : best;
    });

    console.log(`\n${motherload} ORB Motherload:`);
    console.log(`  Best ROI:     ${bestByROI.config.name}`);
    console.log(`                ${bestByROI.avgROI >= 0 ? '+' : ''}${bestByROI.avgROI.toFixed(2)}% ROI, ${bestByROI.profitability.toFixed(1)}% profitable`);
    console.log(`  Safest:       ${safest.config.name}`);
    console.log(`                ${safest.avgROI >= 0 ? '+' : ''}${safest.avgROI.toFixed(2)}% ROI, ${safest.riskOfRuin.toFixed(1)}% ruin risk`);
  }

  // Overall recommendation
  console.log('\n\n' + '═'.repeat(70));
  console.log('RECOMMENDATION');
  console.log('═'.repeat(70));

  // Calculate average performance across all motherload levels for each strategy
  const strategyAverages = strategies.map(strategy => {
    const strategyResults = allResults.filter(r => r.config.name === strategy.name);
    const avgROI = strategyResults.reduce((sum, r) => sum + r.avgROI, 0) / strategyResults.length;
    const avgRisk = strategyResults.reduce((sum, r) => sum + r.riskOfRuin, 0) / strategyResults.length;
    const avgProfit = strategyResults.reduce((sum, r) => sum + r.profitability, 0) / strategyResults.length;

    return {
      name: strategy.name,
      avgROI,
      avgRisk,
      avgProfit,
      score: avgProfit - (avgRisk * 2), // Risk-adjusted score
    };
  });

  const recommended = strategyAverages.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  console.log(`\nBest Overall Strategy: ${recommended.name}`);
  console.log(`  Average ROI:          ${recommended.avgROI >= 0 ? '+' : ''}${recommended.avgROI.toFixed(2)}%`);
  console.log(`  Average Profitability: ${recommended.avgProfit.toFixed(1)}%`);
  console.log(`  Average Risk of Ruin:  ${recommended.avgRisk.toFixed(1)}%`);
  console.log(`  Risk-Adjusted Score:   ${recommended.score.toFixed(1)}`);

  console.log('\n' + '═'.repeat(70));
  console.log('Simulation complete!');
  console.log('═'.repeat(70) + '\n');
}

// Run the simulation
main().catch(console.error);
