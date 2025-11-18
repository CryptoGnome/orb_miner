# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Smart Autonomous ORB Mining Bot** - A fully automated TypeScript CLI bot for ORB mining on Solana with intelligent threshold-based operation. ORB is a **lottery-style mining game** (not traditional proof-of-work) where miners deploy SOL to a 5x5 grid (25 squares), and a random square/miner wins the rewards each round.

**Key Concepts:**
- Each round has 25 squares (0-24)
- Miners deploy SOL to squares to participate
- Random square wins at round end
- Rewards = SOL from losing miners + ORB from motherload (vault)
- Bot deploys to all 25 squares each round to maximize chances

**Smart Bot Features:**
- 🤖 **Fully Autonomous** - One command, zero manual intervention
- ⚙️ **Auto-Setup** - Creates and funds automation account on first run
- 🎯 **Smart Mining** - Deploys based on motherload threshold (profitability)
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

## Smart Bot Logic

The [smartBot.ts](src/commands/smartBot.ts) command implements the fully autonomous bot:

1. **Auto-Setup (First Run)**:
   - Checks if automation account exists
   - If not, creates automation account automatically
   - Smart budget allocation based on current motherload:
     - Higher motherload = fewer rounds with more SOL/round (better EV)
     - Motherload tiers: 0-99 ORB = 100 rounds, 700+ ORB = 30 rounds
   - Uses configurable % of wallet SOL (default 90%)

2. **Smart Mining Loop**:
   - Continuously monitors Board account for new rounds
   - Detects when round changes (new round starts)
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

## Testing Changes

When modifying the bot:
1. Set `DRY_RUN=true` in .env to test without sending real transactions
2. Set low thresholds for testing:
   - `MOTHERLOAD_THRESHOLD=10` (mine even with low motherload)
   - `INITIAL_AUTOMATION_BUDGET_PCT=10` (use small budget for testing)
   - `AUTO_CLAIM_SOL_THRESHOLD=0.001` (claim quickly)
3. Monitor `logs/error.log` for issues
4. Check `logs/transactions.log` for all transaction signatures
5. Use legacy commands for manual testing:
   - `npx ts-node src/commands/query.ts` (check balances)
   - `npx ts-node src/commands/claim.ts` (manual claim)
   - `npx ts-node src/commands/swap.ts` (manual swap)

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

## Project Context

- **ORB Program**: `boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk`
- **ORB Token Mint**: `orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn`
- **Network**: Solana mainnet-beta
- **Based on**: ORE protocol (https://github.com/regolith-labs/ore)

## How It Works

1. **First Run**: `npm start`
   - Bot detects no automation account exists
   - Auto-creates account with smart budget (90% of wallet SOL by default)
   - Budget is split across N rounds based on motherload (higher motherload = fewer, larger rounds)
   - Starts mining immediately

2. **Continuous Operation**:
   - Monitors for new rounds every 10 seconds
   - Deploys to all 25 squares when motherload >= threshold
   - Auto-claims rewards every 5 minutes if thresholds met
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
