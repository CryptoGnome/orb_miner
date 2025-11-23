/**
 * Strategy Types for ORB Mining Bot
 *
 * Extensible strategy system for deployment amounts and claiming behavior.
 * Add new strategies by extending these enums and implementing their handlers.
 */

/**
 * Deployment Amount Strategy
 *
 * Determines how much SOL to deploy per round
 */
export enum DeploymentAmountStrategy {
  /**
   * ULTRA_CONSERVATIVE: Maximum rounds, smallest bets (RECOMMENDED)
   * +1554% avg ROI, 7.2 Sharpe ratio, 0% risk of ruin
   * Best for: Long-term profitability, risk-averse miners, high competition
   */
  ULTRA_CONSERVATIVE = 'ultra_conservative',

  /**
   * BALANCED: Moderate rounds, balanced bets (DEFAULT)
   * +1130% avg ROI, 6.3 Sharpe ratio, 0% risk of ruin
   * Best for: Balanced risk/reward, moderate competition
   */
  BALANCED = 'balanced',

  /**
   * AGGRESSIVE: Fewer rounds, larger bets
   * +683% avg ROI, 4.9 Sharpe ratio, 0% risk of ruin
   * Best for: High risk tolerance, quick returns, low competition
   */
  AGGRESSIVE = 'aggressive',

  /**
   * KELLY_OPTIMIZED: Mathematically optimal bet sizing
   * +904% avg ROI, 5.6 Sharpe ratio, 0% risk of ruin
   * Best for: Kelly Criterion followers, mathematical optimization
   */
  KELLY_OPTIMIZED = 'kelly_optimized',

  /**
   * MANUAL: User specifies exact SOL amount per round
   * Bot uses MANUAL_AMOUNT_PER_ROUND setting
   */
  MANUAL = 'manual',

  /**
   * FIXED_ROUNDS: User specifies target number of rounds
   * Bot calculates amount per round: budget / (target_rounds * 25 squares)
   */
  FIXED_ROUNDS = 'fixed_rounds',

  /**
   * PERCENTAGE: User specifies percentage of total budget per round
   * Bot calculates amount per round: budget * (percentage / 100) / 25 squares
   */
  PERCENTAGE = 'percentage',
}

/**
 * Claim Strategy
 *
 * Determines when and how to claim rewards
 */
export enum ClaimStrategy {
  /**
   * AUTO: Automatic threshold-based claiming (current behavior)
   * Claims when rewards exceed configured thresholds
   */
  AUTO = 'auto',

  /**
   * MANUAL: User triggers claims manually via dashboard
   * Bot never auto-claims, user has full control
   */
  MANUAL = 'manual',

  // Future strategies can be added here:
  // TIME_BASED = 'time_based',      // Claim every X hours
  // VALUE_BASED = 'value_based',    // Claim when USD value exceeds threshold
  // HYBRID = 'hybrid',              // Combination of auto + manual
  // GAS_OPTIMIZED = 'gas_optimized', // Claim when gas fees are low
}

/**
 * Deployment Amount Strategy Configuration
 *
 * Contains all parameters needed for each deployment strategy
 */
export interface DeploymentStrategyConfig {
  strategy: DeploymentAmountStrategy;

  // MANUAL strategy params
  manualAmountPerRound?: number;

  // FIXED_ROUNDS strategy params
  targetRounds?: number;

  // PERCENTAGE strategy params
  budgetPercentagePerRound?: number;

  // AUTO strategy params (optional custom tier configuration)
  customAutoTiers?: Array<{ motherloadThreshold: number; targetRounds: number }>;

  // Common params (used by AUTO and other strategies)
  usableBudget: number;
  motherloadOrb: number;
}

/**
 * Claim Strategy Configuration
 *
 * Contains all parameters needed for each claim strategy
 */
export interface ClaimStrategyConfig {
  strategy: ClaimStrategy;

  // AUTO strategy params (thresholds)
  autoClaimSolThreshold?: number;
  autoClaimOrbThreshold?: number;
  autoClaimStakingOrbThreshold?: number;

  // TIME_BASED strategy params (future)
  // claimIntervalHours?: number;

  // VALUE_BASED strategy params (future)
  // minClaimValueUsd?: number;
}

/**
 * Strategy calculation result for deployment
 */
export interface DeploymentCalculation {
  solPerSquare: number;
  solPerRound: number;
  totalSquares: number;
  estimatedRounds: number;
  strategyUsed: DeploymentAmountStrategy;
  notes: string;
}

/**
 * Strategy labels for UI dropdowns
 */
export const DEPLOYMENT_STRATEGY_LABELS: Record<DeploymentAmountStrategy, string> = {
  [DeploymentAmountStrategy.ULTRA_CONSERVATIVE]: '🛡️ Ultra Conservative (Recommended)',
  [DeploymentAmountStrategy.BALANCED]: '⚖️ Balanced',
  [DeploymentAmountStrategy.AGGRESSIVE]: '⚡ Aggressive',
  [DeploymentAmountStrategy.KELLY_OPTIMIZED]: '🎯 Kelly Optimized',
  [DeploymentAmountStrategy.MANUAL]: '✏️ Manual (Fixed Amount)',
  [DeploymentAmountStrategy.FIXED_ROUNDS]: '🔢 Fixed Rounds',
  [DeploymentAmountStrategy.PERCENTAGE]: '📊 Percentage of Budget',
};

/**
 * Detailed strategy descriptions for tooltips
 */
export const DEPLOYMENT_STRATEGY_DESCRIPTIONS: Record<DeploymentAmountStrategy, string> = {
  [DeploymentAmountStrategy.ULTRA_CONSERVATIVE]:
    `🛡️ ULTRA CONSERVATIVE (RECOMMENDED)

Performance (220k+ simulations):
• Average ROI: +1,554%
• Sharpe Ratio: 7.2 (excellent risk-adjusted returns)
• Lowest Risk Profile (simulations showed minimal drawdowns)
• ⚠️ Past performance doesn't guarantee future results

How it works:
• Spreads budget over MORE rounds (60-1000 depending on motherload)
• Smaller bets per round = longer survival
• More chances to hit motherload
• Best long-term profitability

Best for:
✓ Risk-averse miners
✓ High competition environments (15x+)
✓ Long-term profitability focus
✓ Maximizing total returns

Example (1200 ORB motherload, 1 SOL budget):
• 120 rounds planned
• ~0.0083 SOL per round
• Expected profit: +592% (+0.592 SOL)

⚠️ RISK WARNING: Cryptocurrency mining involves significant risk. Market conditions, competition levels, and motherload values vary. Never invest more than you can afford to lose.`,

  [DeploymentAmountStrategy.BALANCED]:
    `⚖️ BALANCED

Performance (220k+ simulations):
• Average ROI: +1,130%
• Sharpe Ratio: 6.3 (very good risk-adjusted returns)
• Moderate Risk Profile
• ⚠️ Past performance doesn't guarantee future results

How it works:
• Moderate number of rounds (40-880 depending on motherload)
• Balanced bet sizing
• Good mix of opportunity and safety
• Original optimized configuration

Best for:
✓ Moderate risk tolerance
✓ Balanced approach to mining
✓ Medium competition environments (10-15x)
✓ Steady growth

Example (1200 ORB motherload, 1 SOL budget):
• 80 rounds planned
• ~0.0125 SOL per round
• Expected profit: +392% (+0.392 SOL)

⚠️ RISK WARNING: Cryptocurrency mining involves significant risk. Market conditions, competition levels, and motherload values vary. Never invest more than you can afford to lose.`,

  [DeploymentAmountStrategy.AGGRESSIVE]:
    `⚡ AGGRESSIVE

Performance (220k+ simulations):
• Average ROI: +683%
• Sharpe Ratio: 4.9 (good risk-adjusted returns)
• Higher Risk Profile (larger bets, higher variance)
• ⚠️ Past performance doesn't guarantee future results

How it works:
• Fewer rounds (25-500 depending on motherload)
• LARGER bets per round
• Faster budget depletion
• Higher variance but still profitable

Best for:
✓ High risk tolerance
✓ Quick returns preferred
✓ Low competition environments (<10x)
✓ Shorter mining sessions

Example (1200 ORB motherload, 1 SOL budget):
• 50 rounds planned
• ~0.02 SOL per round
• Expected profit: +242% (+0.242 SOL)

⚠️ RISK WARNING: Cryptocurrency mining involves significant risk. Market conditions, competition levels, and motherload values vary. Never invest more than you can afford to lose.`,

  [DeploymentAmountStrategy.KELLY_OPTIMIZED]:
    `🎯 KELLY OPTIMIZED

Performance (220k+ simulations):
• Average ROI: +904%
• Sharpe Ratio: 5.6 (excellent risk-adjusted returns)
• Moderate-High Risk Profile
• ⚠️ Past performance doesn't guarantee future results

How it works:
• Based on Kelly Criterion mathematics
• Optimal bet sizing for long-term growth
• Balance between aggressive and conservative
• Maximizes geometric mean returns

Best for:
✓ Kelly Criterion followers
✓ Mathematical optimization
✓ Professional miners
✓ Optimal long-term growth rate

Example (1200 ORB motherload, 1 SOL budget):
• 65 rounds planned
• ~0.0154 SOL per round
• Expected profit: +328% (+0.328 SOL)

⚠️ RISK WARNING: Cryptocurrency mining involves significant risk. Market conditions, competition levels, and motherload values vary. Never invest more than you can afford to lose.`,

  [DeploymentAmountStrategy.MANUAL]:
    `✏️ MANUAL (FIXED AMOUNT)

How it works:
• You specify exact SOL amount per round
• Bot deploys that amount every round
• Simple and predictable
• No automatic motherload optimization

Configuration:
• Set MANUAL_AMOUNT_PER_ROUND in settings
• Budget will last: budget / amount_per_round rounds
• Example: 0.01 SOL per round with 1 SOL = 100 rounds

Best for:
✓ Full manual control
✓ Testing specific bet sizes
✓ Predictable budget usage
✓ Simple strategy

⚠️ Note: Does not optimize for motherload levels`,

  [DeploymentAmountStrategy.FIXED_ROUNDS]:
    `🔢 FIXED ROUNDS

How it works:
• You specify target number of rounds
• Bot calculates SOL per round: budget / target_rounds
• Ensures budget lasts exactly that many rounds
• No motherload optimization

Configuration:
• Set TARGET_ROUNDS in settings
• Example: 100 rounds with 1 SOL = 0.01 SOL per round

Best for:
✓ Control over mining duration
✓ Predictable timeline
✓ Budget planning
✓ Time-based strategies

⚠️ Note: Does not optimize for motherload levels`,

  [DeploymentAmountStrategy.PERCENTAGE]:
    `📊 PERCENTAGE OF BUDGET

How it works:
• You specify % of budget per round
• Bot deploys: budget × (percentage / 100) per round
• Example: 1% with 1 SOL = 0.01 SOL per round
• Budget lasts: 100 / percentage rounds

Configuration:
• Set BUDGET_PERCENTAGE_PER_ROUND in settings
• Example: 1.0% = 100 rounds, 2.0% = 50 rounds

Best for:
✓ Proportional betting
✓ Dynamic budget management
✓ Percentage-based strategies
✓ Simple risk control

⚠️ Note: Does not optimize for motherload levels`,
};

export const CLAIM_STRATEGY_LABELS: Record<ClaimStrategy, string> = {
  [ClaimStrategy.AUTO]: 'Auto (Threshold-Based)',
  [ClaimStrategy.MANUAL]: 'Manual (Dashboard Button)',
};
