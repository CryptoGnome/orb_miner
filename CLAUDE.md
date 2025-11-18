# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smart Autonomous ORB Mining Bot** - A fully automated TypeScript CLI bot for ORB mining on Solana with intelligent threshold-based operation. ORB is a **lottery-style mining game** (not traditional proof-of-work) where miners deploy SOL to a 5x5 grid (25 squares), and a random square/miner wins the rewards each round.

**Key Concepts:**
- Each round has 25 squares (0-24)
- Miners deploy SOL to squares to participate
- Random square wins at round end (1 in 625 chance per deployment, each turn independent)
- Rewards = SOL from losing miners + ORB from motherload (vault)
- Bot deploys to all 25 squares each round to maximize chances (25 entries per round)

**Smart Bot Features:**
- 🤖 **Fully Autonomous** - One command, zero manual intervention
- ⚙️ **Auto-Setup** - Creates and funds automation account on first run
- 🎯 **Smart Mining** - Deploys based on motherload threshold (profitability)
- 📈 **Dynamic Scaling** - Automatically adjusts deployment amounts as motherload grows/shrinks
- 🔄 **Auto-Restart** - Recreates automation with optimal amounts when motherload changes significantly
- 💰 **Auto-Claim** - Collects rewards when thresholds are met
- 🔄 **Auto-Swap** - Refunds automation account by swapping ORB to SOL
- 📊 **Auto-Stake** - Optional staking of excess ORB for yield

## Usage

```bash
# Run the smart autonomous bot (one command for everything)
npm start

# Development mode with auto-reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Clean compiled files
npm run clean
```

**First Run:** Bot auto-creates automation account with smart budget allocation based on current motherload.
**Subsequent Runs:** Bot mines continuously using automation funds, auto-claims, auto-swaps, and auto-stakes based on thresholds.

## Architecture

### Entry Point
- [src/index.ts](src/index.ts) - Launches the smart autonomous bot (one entry point, no routing)

### Core Bot
- [src/commands/smartBot.ts](src/commands/smartBot.ts) - **Main smart autonomous bot** with all automation logic:
  - Auto-setup automation account (first run)
  - Continuous round monitoring and deployment
  - Auto-claim rewards (SOL + ORB)
  - Auto-swap ORB to refund automation
  - Auto-stake excess ORB (optional)
  - Fully threshold-driven operation

### Legacy Commands (Available for Testing)
Legacy standalone commands in [src/commands/](src/commands/) - kept for reference/testing:
- **query.ts** - Check balances, rewards, round info, ORB price
- **deploy.ts** - Deploy SOL to all 25 squares once
- **claim.ts** - Claim SOL/ORB rewards from mining and/or staking
- **stake.ts** - Stake ORB tokens for yield
- **swap.ts** - Swap ORB to SOL via Jupiter
- **autoDeploy.ts** - Old automation loop (replaced by smartBot.ts)

### Utilities Layer
Core utilities in [src/utils/](src/utils/):
- **accounts.ts** - PDA derivation and manual account deserialization for Board, Round, Miner, Stake, Treasury accounts
- **program.ts** - Instruction builders (deploy, claim, stake) and transaction sending with retry logic
- **jupiter.ts** - Jupiter API v6 integration for swaps and ORB price fetching
- **solana.ts** - Solana connection setup
- **wallet.ts** - Keypair loading from base58 private key
- **config.ts** - .env configuration loading and validation
- **logger.ts** - Winston-based logging (console + files)
- **retry.ts** - Exponential backoff retry logic

### Types
[src/types/index.ts](src/types/index.ts) - TypeScript interfaces for all on-chain accounts and API responses

## Critical Technical Details

### Manual Account Deserialization
The ORB program has no public IDL. All account structures are reverse-engineered from the ORE source code and real transactions:
- **Board**: roundId, startSlot, endSlot (tracks current round)
- **Round**: 25-element arrays for deployed amounts, motherload balance, totals
- **Miner**: 25-element arrays for deployments, claimable rewards (SOL + ORB), lifetime stats
- **Stake**: Staking balance and rewards
- **Treasury**: Global motherload and staking totals

Account deserialization uses manual buffer parsing with specific byte offsets. If account structures change on-chain, offsets in [accounts.ts:108-272](src/utils/accounts.ts#L108-L272) must be updated.

### Instruction Format (Reverse-Engineered)
All instructions are manually constructed by analyzing real ORB transactions:
- **Deploy**: 34-byte instruction with discriminator `0x0040420f00000000`, amount in lamports, squares mask (MUST be 0), and square count (25)
- **Claim SOL**: 1-byte discriminator `0x03` with 3 accounts (wallet, miner PDA, system program)
- **Claim ORB**: 1-byte discriminator `0x04` with 9 accounts (includes token accounts, treasury, SPL token programs)
- **Stake**: 16-byte instruction with discriminator and amount

See [program.ts:17-196](src/utils/program.ts#L17-L196) for instruction builders.

### Program-Derived Addresses (PDAs)
All accounts use PDAs derived from specific seeds:
- **Board**: `["board"]` - Singleton tracking current round
- **Round**: `["round", roundId]` - One per round
- **Miner**: `["miner", authority]` - One per wallet
- **Stake**: `["stake", authority]` - One per wallet
- **Treasury**: `["treasury"]` - Singleton for global state
- **Automation**: `["automation", authority]` - Used for deploy transactions

PDA derivation in [accounts.ts:8-77](src/utils/accounts.ts#L8-L77).

### Jupiter Integration
Jupiter API v6 is used for:
- Getting ORB/SOL swap quotes
- Executing swaps with configurable slippage
- Fetching ORB price in SOL and USD

The bot can auto-swap ORB to SOL when balance is low. See [jupiter.ts](src/utils/jupiter.ts) and [swap.ts](src/commands/swap.ts).

### Automation Account System
The bot uses a dedicated PDA (Program-Derived Address) for autonomous operation:

**Key Points:**
- **PDA Derivation**: Derived from seeds `["automation", authority]` + ORB program ID
- **Structure**: 112-byte account storing strategy parameters and execution state
  - Offset 8-16: `amountPerSquare` (u64) - SOL to deploy per square
  - Offset 16-17: `squareCount` (u8) - Number of squares to deploy to (25)
  - Offset 17-49: `authority` (Pubkey) - Wallet that owns this automation
  - Additional fields for timing, checkpoint tracking, and round management

**Lifecycle:**
1. **First Run**: Bot creates automation account via `buildAutomateInstruction()`
2. **Each Round**: Bot executes deployment via `buildExecuteAutomationInstruction()`
3. **Refunding**: When balance low, bot swaps ORB→SOL and transfers to automation PDA
4. **Closing**: Can manually close via `tests/test-close-automation.ts` to reclaim rent

**Important**: The automation PDA holds the SOL balance used for mining. Your main wallet holds ORB for swapping/staking.

## Smart Bot Logic

The [smartBot.ts](src/commands/smartBot.ts) command implements the fully autonomous bot:

1. **Auto-Setup (First Run)**:
   - Checks if automation account exists
   - If not, creates automation account automatically
   - Smart budget allocation based on current motherload:
     - Higher motherload = fewer rounds with more SOL/round (better EV)
     - Motherload tiers: 0-99 ORB = 100 rounds, 700+ ORB = 30 rounds
   - Uses configurable % of wallet SOL (default 90%)

2. **Smart Mining Loop with Dynamic Scaling**:
   - Continuously monitors Board account for new rounds
   - Detects when round changes (new round starts)
   - **Dynamic Deployment Amounts**: Automatically scales deployment based on motherload
     - Higher motherload = larger deployments (better EV)
     - Motherload tiers: 200-299 ORB (120 rounds), 300-399 (100 rounds), 400-499 (80 rounds), 500-599 (60 rounds), 600-699 (45 rounds), 700-999 (30 rounds), 1000+ (20 rounds)
     - More ORB in motherload = fewer rounds with bigger bets = maximize EV
   - **Auto-Restart for Scaling**: Automatically closes and recreates automation when motherload changes significantly
     - Triggers on 50%+ increase (≥100 ORB change) to deploy more when rewards grow
     - Triggers on 40%+ decrease (≥100 ORB change) to reduce risk when rewards shrink
     - Seamlessly adapts to market conditions without manual intervention
   - Only deploys when motherload >= threshold (profitability check)
   - Executes deployment using automation account funds
   - Tracks remaining balance and warns when low

3. **Auto-Claim**:
   - Periodically checks mining and staking rewards
   - Auto-claims SOL when >= AUTO_CLAIM_SOL_THRESHOLD
   - Auto-claims ORB when >= AUTO_CLAIM_ORB_THRESHOLD
   - Runs independently of mining loop

4. **Auto-Swap (Refund Automation)**:
   - Monitors automation account balance
   - When balance < MIN_AUTOMATION_BALANCE, triggers swap
   - Swaps ORB to SOL to refund automation account
   - Keeps mining running without interruption
   - Respects MIN_ORB_TO_KEEP safety reserve

5. **Auto-Stake (Optional)**:
   - Periodically checks ORB balance
   - Stakes excess ORB when >= STAKE_ORB_THRESHOLD
   - Generates passive yield while mining

6. **Resilience**:
   - Retries on failure with exponential backoff
   - Logs all transactions to `logs/transactions.log`
   - Graceful shutdown on Ctrl+C
   - Handles edge cases (already deployed, round ended, etc.)

## Configuration

All bot behavior is controlled by .env variables. **Threshold-based settings** for autonomous operation:

### Mining Thresholds
- `MOTHERLOAD_THRESHOLD`: Only mine when motherload >= this (default: 100 ORB)
- `CHECK_ROUND_INTERVAL_MS`: How often to check for new rounds (default: 10000ms)

### Automation Account
- `INITIAL_AUTOMATION_BUDGET_PCT`: % of wallet SOL to use for setup (default: 90%)
- `MIN_AUTOMATION_BALANCE`: Trigger refund when balance < this (default: 0.5 SOL)

### Auto-Claim Thresholds
- `AUTO_CLAIM_SOL_THRESHOLD`: Claim SOL rewards when >= this (default: 0.1 SOL)
- `AUTO_CLAIM_ORB_THRESHOLD`: Claim ORB rewards when >= this (default: 1.0 ORB)
- `CHECK_REWARDS_INTERVAL_MS`: How often to check rewards (default: 300000ms / 5 min)

### Auto-Swap Settings
- `AUTO_SWAP_ENABLED`: Enable auto-swapping ORB to refund automation (default: true)
- `SWAP_ORB_AMOUNT`: Amount of ORB to swap each time (default: 10 ORB)
- `MIN_ORB_TO_KEEP`: Never go below this ORB balance (default: 5 ORB)
- `SLIPPAGE_BPS`: Slippage tolerance for swaps (default: 50 bps = 0.5%)

### Auto-Stake Settings (Optional)
- `AUTO_STAKE_ENABLED`: Enable auto-staking excess ORB (default: false)
- `STAKE_ORB_THRESHOLD`: Stake when ORB balance >= this (default: 50 ORB)

### Safety Settings
- `DRY_RUN`: Simulate without sending real transactions (default: false)
- `MIN_SOL_BALANCE`: Minimum wallet SOL to maintain (default: 0.1 SOL)

See [.env.example](.env.example) for complete configuration with comments.

## Logging

Winston logger writes to:
- Console (INFO and above)
- `logs/combined.log` (all messages)
- `logs/error.log` (errors only)
- `logs/transactions.log` (transaction signatures)

## Monitoring the Bot

### Real-Time Monitoring
Watch logs in real-time:
```bash
# All logs
tail -f logs/combined.log

# Errors only
tail -f logs/error.log

# Transaction signatures only
tail -f logs/transactions.log
```

### Key Metrics to Monitor
- **Automation Balance**: Should stay above `MIN_AUTOMATION_BALANCE`
- **Motherload**: Check if consistently above/below threshold
- **Claim Success**: Verify rewards are being claimed
- **Swap Success**: Ensure ORB→SOL swaps complete when triggered

### Checking Status Manually
```bash
# Quick status check (run in separate terminal while bot runs)
npx ts-node tests/test-query.ts
```

## Testing & Debugging

### Test Scripts
Run individual test scripts for debugging specific functionality:

```bash
# Query balances and round info
npx ts-node tests/test-query.ts

# Test deployment
npx ts-node tests/test-deploy.ts

# Test claiming rewards
npx ts-node tests/test-claim.ts

# Test swapping
npx ts-node tests/test-swap.ts

# Check automation account status
npx ts-node tests/check-automation-account.ts

# Debug miner account
npx ts-node tests/debug-miner-account.ts

# Analyze specific transactions
npx ts-node tests/analyze-transaction.ts
```

### Automation Account Debugging
```bash
# Check if automation account exists and its balance
npx ts-node tests/check-automation-account.ts

# Reset automation account (warning: loses remaining balance)
npx ts-node tests/reset-automation.ts

# Test automation setup
npx ts-node tests/test-setup-smart-automation.ts
```

## Testing Changes

### Before Modifying Code
1. Run full query to capture current state:
   ```bash
   npx ts-node tests/test-query.ts > pre-change-state.txt
   ```

### Testing Workflow
1. **Set DRY_RUN Mode**:
   ```env
   DRY_RUN=true
   ```

2. **Use Low Thresholds** (in .env):
   ```env
   MOTHERLOAD_THRESHOLD=10
   INITIAL_AUTOMATION_BUDGET_PCT=10
   AUTO_CLAIM_SOL_THRESHOLD=0.001
   MIN_AUTOMATION_BALANCE=0.1
   CHECK_ROUND_INTERVAL_MS=5000
   ```

3. **Test Individual Components**:
   - Config changes: `npx ts-node tests/test-query.ts`
   - Deployment logic: `npx ts-node tests/test-deploy.ts`
   - Claim logic: `npx ts-node tests/test-claim.ts`
   - Swap logic: `npx ts-node tests/test-swap.ts`

4. **Test Automation Setup**:
   ```bash
   # Close existing automation (if any)
   npx ts-node tests/test-close-automation.ts

   # Test setup with small budget
   npm run dev
   # Should create automation account and deploy once, then Ctrl+C
   ```

5. **Monitor Logs During Testing**:
   ```bash
   tail -f logs/combined.log | grep -i "error\|warning\|success"
   ```

6. **Verify Transaction on Explorer**: Check `logs/transactions.log` for signatures

### After Testing
1. Set `DRY_RUN=false`
2. Restore production thresholds
3. Test with minimal real funds first
4. Monitor for one full round before leaving unattended

## Common Tasks

### Modify smart bot behavior
The bot is designed for easy customization. Common modifications:

1. **Change mining strategy**: Edit [smartBot.ts:82-95](src/commands/smartBot.ts#L82-L95) `calculateTargetRounds()` function
2. **Add new threshold check**: Add new config value, then add check in main loop
3. **Modify auto-claim logic**: Edit [smartBot.ts:143-175](src/commands/smartBot.ts#L143-L175) `autoClaimRewards()` function
4. **Customize auto-swap**: Edit [smartBot.ts:177-223](src/commands/smartBot.ts#L177-L223) `autoRefundAutomation()` function

### Modify instruction format
If ORB program updates and instructions change:
1. Analyze a recent successful transaction on Solana explorer
2. Update discriminators and data layout in [program.ts](src/utils/program.ts)
3. Update account list if needed
4. Test with DRY_RUN first

### Update account structure
If on-chain account layouts change:
1. Locate the changed account type in [accounts.ts](src/utils/accounts.ts)
2. Update byte offsets in deserialize functions (fetchBoard, fetchRound, etc.)
3. Add/remove fields in corresponding TypeScript interface in [types/index.ts](src/types/index.ts)
4. Test thoroughly with query command

### Add new configuration option
1. Add to [.env.example](.env.example) with description and default value
2. Add to Config interface in [config.ts:8-71](src/utils/config.ts#L8-L71)
3. Add to loadConfig function in [config.ts:92-165](src/utils/config.ts#L92-L165) with getEnv/getEnvNumber/getEnvBoolean
4. Use via `config.yourNewOption` in [smartBot.ts](src/commands/smartBot.ts)

### Troubleshoot automation account issues
If automation account has issues:
1. Check account exists: `npx ts-node tests/check-automation-account.ts`
2. Verify balance: Should show `amountPerSquare` and remaining balance
3. Check PDA derivation in [accounts.ts:20-25](src/utils/accounts.ts#L20-L25)
4. Review instruction building in [program.ts:47-87](src/utils/program.ts#L47-L87)
5. If corrupted, reset with `npx ts-node tests/reset-automation.ts` (WARNING: loses balance)

### Debug transaction failures
1. Copy transaction signature from `logs/transactions.log`
2. View on Solana Explorer: `https://solscan.io/tx/{signature}`
3. Run analyzer: Edit `tests/analyze-transaction.ts` with signature, then run
4. Check error logs: `tail -50 logs/error.log`

## Project Context

- **ORB Program**: `boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk`
- **ORB Token Mint**: `orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn`
- **Network**: Solana mainnet-beta
- **Based on**: ORE protocol (https://github.com/regolith-labs/ore)

## Important Notes

### Security
- Never commit `.env` file with real private keys
- Use dedicated wallet for bot operations
- Test with small amounts first
- Keep backup of private key offline

### Performance
- Faster RPC endpoints reduce missed rounds (consider Helius, QuickNode)
- `CHECK_ROUND_INTERVAL_MS` trades off between responsiveness and RPC calls
- Lower intervals (~5000ms) = more responsive but more RPC usage

### Cost Optimization
- Higher `MOTHERLOAD_THRESHOLD` = fewer rounds mined, lower costs, better EV
- **Dynamic Scaling**: Bot automatically deploys more when motherload is high (maximizes EV)
- **Auto-Restart**: Bot recreates automation when motherload changes significantly (stays optimal)
- `INITIAL_AUTOMATION_BUDGET_PCT` determines how long bot runs before needing refund
- Auto-swap keeps bot running but incurs swap fees (Jupiter ~0.5%)
- Trade-off: Larger deployments = higher risk but better rewards when motherload is high

### Limitations
- No public IDL means program changes require reverse-engineering
- Automation account can't be refunded automatically yet (requires manual transfer or swap)
- Round timing is unpredictable (depends on network activity)

## How It Works

1. **First Run**: `npm start`
   - Bot detects no automation account exists
   - Auto-creates account with smart budget (90% of wallet SOL by default)
   - Budget is split across N rounds based on motherload (higher motherload = fewer, larger rounds)
   - Starts mining immediately

2. **Continuous Operation with Dynamic Scaling**:
   - Monitors for new rounds every 10 seconds
   - **Checks motherload changes**: Compares current vs setup motherload each round
   - **Auto-restarts if needed**: When motherload grows 50%+ or shrinks 40%+ (≥100 ORB change)
     - Closes current automation and recreates with optimal amounts
     - Example: 300 ORB at setup → 500 ORB now = auto-restart with 67% larger deployments
   - Deploys to all 25 squares when motherload >= threshold
   - Auto-claims rewards every 30 seconds if thresholds met
   - Auto-swaps ORB to SOL when automation balance low
   - Auto-stakes excess ORB if enabled
   - Runs until automation depleted or stopped (Ctrl+C)

3. **Refunding**:
   - When automation balance < MIN_AUTOMATION_BALANCE:
     - Bot auto-swaps SWAP_ORB_AMOUNT ORB to SOL
     - Refunds automation account (TODO: transfer to PDA)
     - Continues mining without interruption
   - Manual refund: Transfer SOL to automation PDA address

**The bot is fully autonomous - just set thresholds in .env and run `npm start`!**
