# Strategy System - Manual Controls & Extensibility

This document explains the new strategy-based system for deployment amounts and claiming behavior.

## Overview

The bot now supports **multiple strategies** for both deployment amounts and claiming, with an extensible architecture that makes it easy to add new strategies in the future.

## Features Implemented

### 1. Deployment Amount Strategy

Control how much SOL is deployed per round with these strategies:

#### Available Strategies:

- **Auto (default)** - Automatic calculation based on motherload tiers
  - Uses Monte Carlo optimized tiers for maximum ROI
  - Original behavior, proven performance

- **Manual** - User specifies exact SOL amount per round
  - Set `MANUAL_AMOUNT_PER_ROUND` to your desired amount (e.g., 0.05)
  - Bot will deploy exactly this amount every round
  - Full control over deployment size

- **Fixed Rounds** - User specifies target number of rounds
  - Set `TARGET_ROUNDS` to desired rounds (e.g., 200)
  - Bot calculates amount per round: `budget / (target_rounds * 25)`
  - Great for planning budget over specific timeframe

- **Percentage** - User specifies percentage of budget per round
  - Set `BUDGET_PERCENTAGE_PER_ROUND` (e.g., 0.5 for 0.5% per round)
  - Bot calculates: `budget * (percentage / 100) / 25`
  - Useful for conservative or aggressive approaches

### 2. Claim Strategy

Control when and how rewards are claimed:

#### Available Strategies:

- **Auto (default)** - Automatic threshold-based claiming
  - Claims when SOL/ORB exceed configured thresholds
  - Original behavior, hands-off operation

- **Manual** - User triggers claims manually via dashboard
  - Bot never auto-claims
  - User has full control via "Claim Now" button
  - Perfect for tax planning or strategic timing

## Configuration

### Database Settings

All strategies are configured via database settings (accessible through dashboard):

```
# Deployment Amount Strategy
DEPLOYMENT_AMOUNT_STRATEGY = 'auto' | 'manual' | 'fixed_rounds' | 'percentage'

# Manual strategy params
MANUAL_AMOUNT_PER_ROUND = 0.01  # SOL per round when strategy = manual

# Fixed rounds strategy params
TARGET_ROUNDS = 100  # Target rounds when strategy = fixed_rounds

# Percentage strategy params
BUDGET_PERCENTAGE_PER_ROUND = 1.0  # % per round when strategy = percentage

# Claim Strategy
CLAIM_STRATEGY = 'auto' | 'manual'

# Auto claim thresholds (used when CLAIM_STRATEGY = auto)
AUTO_CLAIM_SOL_THRESHOLD = 0.1
AUTO_CLAIM_ORB_THRESHOLD = 1.0
AUTO_CLAIM_STAKING_ORB_THRESHOLD = 0.5
```

### Using the Settings

1. **Via Dashboard** (recommended):
   - Navigate to Settings page
   - Select strategy from dropdown
   - Configure strategy-specific parameters
   - Save settings

2. **Via Database Direct**:
   ```sql
   UPDATE settings SET value = 'manual' WHERE key = 'DEPLOYMENT_AMOUNT_STRATEGY';
   UPDATE settings SET value = '0.05' WHERE key = 'MANUAL_AMOUNT_PER_ROUND';
   ```

## Examples

### Example 1: Manual Amount Per Round

Want to deploy exactly 0.05 SOL per round?

```
DEPLOYMENT_AMOUNT_STRATEGY = manual
MANUAL_AMOUNT_PER_ROUND = 0.05
```

Bot will create automation with 0.05 SOL per round (0.002 SOL per square).

### Example 2: Fixed Rounds Budget

Want your budget to last exactly 200 rounds?

```
DEPLOYMENT_AMOUNT_STRATEGY = fixed_rounds
TARGET_ROUNDS = 200
```

If you have 1 SOL budget, bot will deploy 0.005 SOL per round (1 / 200).

### Example 3: Conservative Percentage

Want to deploy only 0.5% of budget per round?

```
DEPLOYMENT_AMOUNT_STRATEGY = percentage
BUDGET_PERCENTAGE_PER_ROUND = 0.5
```

If you have 1 SOL budget, bot will deploy 0.005 SOL per round (200 rounds total).

### Example 4: Manual Claiming

Want to claim rewards manually for tax optimization?

```
CLAIM_STRATEGY = manual
```

Bot will never auto-claim. Use the dashboard "Claim Now" button to trigger claims.

## API Endpoints

### Manual Claim Endpoint

**POST** `/api/claim`
- Triggers manual claim of all available rewards
- Returns success/error status

**GET** `/api/claim`
- Returns claimable amounts
- Response:
  ```json
  {
    "success": true,
    "claimable": {
      "mining": { "sol": 0.15, "orb": 2.5 },
      "staking": { "sol": 0, "orb": 1.2 },
      "total": { "sol": 0.15, "orb": 3.7 }
    }
  }
  ```

## Architecture

### Files Modified/Created:

1. **[src/types/strategies.ts](src/types/strategies.ts)** - Strategy type definitions
2. **[src/utils/strategies.ts](src/utils/strategies.ts)** - Strategy handler implementations
3. **[src/utils/settingsLoader.ts](src/utils/settingsLoader.ts)** - Database defaults
4. **[src/utils/config.ts](src/utils/config.ts)** - Config interface
5. **[src/commands/smartBot.ts](src/commands/smartBot.ts)** - Strategy integration
6. **[dashboard/app/api/claim/route.ts](dashboard/app/api/claim/route.ts)** - Manual claim API

### Adding New Strategies

The architecture is designed for easy extensibility:

1. **Add enum value** in `src/types/strategies.ts`:
   ```typescript
   export enum DeploymentAmountStrategy {
     // ... existing strategies
     AGGRESSIVE = 'aggressive',  // New strategy
   }
   ```

2. **Add handler** in `src/utils/strategies.ts`:
   ```typescript
   case DeploymentAmountStrategy.AGGRESSIVE: {
     // Implement aggressive logic
     return { ... };
   }
   ```

3. **Add settings** (if needed) in `src/utils/settingsLoader.ts`:
   ```typescript
   { key: 'AGGRESSIVE_MULTIPLIER', value: '2.0', ... }
   ```

4. **Add UI** in dashboard settings page (optional)

That's it! The strategy is now available.

## Benefits

1. **User Control** - Full control over deployment amounts and claiming
2. **Extensibility** - Easy to add new strategies without changing core logic
3. **Backward Compatible** - Default 'auto' strategy maintains existing behavior
4. **Type Safe** - TypeScript enums prevent invalid strategy values
5. **Validation** - Strategy configs validated before use
6. **Clean Code** - Centralized strategy logic, easy to maintain

## Notes

- When changing strategies, restart the bot for changes to take effect
- Config is cached at startup and refreshed each new round
- Invalid strategy configs will fallback to AUTO with a warning
- Manual claim button will appear in dashboard when CLAIM_STRATEGY = 'manual'

## Future Strategy Ideas

Potential strategies that could be added:

**Deployment:**
- `risk_adjusted` - Adjust based on motherload volatility
- `time_based` - Different amounts at different times
- `competitive` - Adjust based on competition levels
- `roi_optimized` - Dynamic optimization based on live ROI

**Claiming:**
- `time_based` - Claim every X hours
- `value_based` - Claim when USD value exceeds threshold
- `hybrid` - Combination of auto + manual
- `gas_optimized` - Claim when transaction fees are low
- `tax_optimized` - Claim to minimize tax impact

Each can be added in ~10 lines of code!
