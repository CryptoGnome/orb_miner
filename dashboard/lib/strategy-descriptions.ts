/**
 * Strategy descriptions for tooltips
 * Synced with src/types/strategies.ts
 */

export const DEPLOYMENT_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  ultra_conservative: `🛡️ ULTRA CONSERVATIVE (RECOMMENDED)

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

  balanced: `⚖️ BALANCED

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

  aggressive: `⚡ AGGRESSIVE

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

  kelly_optimized: `🎯 KELLY OPTIMIZED

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

  manual: `✏️ MANUAL (FIXED AMOUNT)

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

  fixed_rounds: `🔢 FIXED ROUNDS

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

  percentage: `📊 PERCENTAGE OF BUDGET

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
