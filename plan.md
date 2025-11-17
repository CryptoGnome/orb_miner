# ORB Mining CLI Automation Tool - Implementation Plan

## Project Overview
Build a TypeScript CLI automation bot to interact with the ORB program (fork of ORE) deployed at `boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk` on Solana mainnet.

**GitHub Reference:** https://github.com/regolith-labs/ore
**ORB Program:** https://orb.helius.dev/address/boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk/history?cluster=mainnet-beta

## How ORE/ORB Works
ORE/ORB is a **lottery-style mining game**, not traditional proof-of-work:
- Each round has a **5x5 grid (25 squares)**
- Miners **deploy SOL** to one or more squares
- At round end, a **random square wins**
- A **random miner** within that winning square gets the rewards
- **Rewards = SOL from losing miners + ORE from the motherload (vault)**

**Key Operations:**
- `deploy <square>` - Deploy SOL to a specific square (0-24)
- `deploy_all` - Deploy SOL across all 25 squares
- `claim` - Claim SOL and/or ORE rewards
- `stake` - Stake ORE tokens for yield
- `board` / `round` / `miner` - Query current state

## Account Structures (from ORE source)

**Board Account:**
- `round_id` - Current round number
- `start_slot` - When current round started
- `end_slot` - When current round ends

**Round Account:**
- `deployed[]` - Array of 25 u64 values (SOL deployed per square)
- `motherload` - ORE vault balance for this round
- `total_deployed` - Total SOL deployed across all squares
- `total_winnings` - Total winnings distributed
- Square-specific data (miner counts, etc.)

**Miner Account:**
- `deployed[]` - Array of 25 u64 values (your SOL in each square)
- `rewards_sol` - Claimable SOL amount
- `rewards_ore` - Claimable ORE amount
- `round_id` - Round you're currently in
- `lifetime_rewards_sol` - Total SOL earned
- `lifetime_rewards_ore` - Total ORE earned

## Project Structure
```
orb_miner/
├── src/
│   ├── commands/
│   │   ├── deploy.ts           # Deploy SOL to squares
│   │   ├── claim.ts            # Claim rewards (SOL/ORE)
│   │   ├── stake.ts            # Stake ORE tokens
│   │   ├── swap.ts             # Swap ORB to SOL via Jupiter
│   │   ├── autoDeploy.ts       # Automated deployment loop
│   │   └── query.ts            # Query board/round/miner state
│   ├── utils/
│   │   ├── solana.ts           # Solana connection setup
│   │   ├── wallet.ts           # Wallet operations
│   │   ├── program.ts          # ORB program interactions
│   │   ├── accounts.ts         # Account deserialization (Board, Round, Miner)
│   │   ├── jupiter.ts          # Jupiter API integration (price, swap)
│   │   ├── config.ts           # Load .env config
│   │   ├── logger.ts           # File & console logging
│   │   └── retry.ts            # Retry logic for errors
│   ├── types/
│   │   └── index.ts            # TypeScript types (Board, Round, Miner structs)
│   └── index.ts                # Main bot controller
├── logs/                       # Transaction logs
├── .env.example                # Template config
├── .env                        # Actual config (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Core Dependencies
- `@solana/web3.js` - Solana blockchain interaction
- `@coral-xyz/anchor` - Program interaction (IDL parsing)
- `@jup-ag/api` - Jupiter API for swaps and pricing
- `axios` - HTTP requests for Jupiter API
- `dotenv` - Environment variables
- `typescript`, `ts-node` - TypeScript support
- `winston` - Advanced logging

## .env Configuration
```
# Wallet & Network
PRIVATE_KEY=your_base58_private_key
RPC_ENDPOINT=your_rpc_url
ORB_PROGRAM_ID=boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk
ORB_TOKEN_MINT=<orb_token_mint_address>  # ORB SPL token mint address (for swaps)
NETWORK=mainnet-beta

# Bot Action
BOT_ACTION=auto-deploy  # Options: auto-deploy, deploy, claim, stake, swap, query

# Deployment Settings
DEPLOY_STRATEGY=all              # Strategy: all (all 25 squares) - default behavior
SOL_PER_DEPLOYMENT=0.01          # Amount of SOL to deploy per round (to all squares)
MOTHERLOAD_THRESHOLD=50          # Only deploy when motherload >= this value (ORE)
CHECK_ROUND_INTERVAL_MS=30000    # How often to check round state (30 seconds)
MIN_SOL_FOR_DEPLOYMENT=0.3       # Pause and alert if SOL drops below this (to refill)

# Claim Settings
AUTO_CLAIM_ENABLED=true          # Enable automatic claiming
CLAIM_THRESHOLD_SOL=1.0          # Auto-claim when mining SOL rewards >= this
CLAIM_THRESHOLD_ORB=100          # Auto-claim when mining ORB rewards >= this
CLAIM_TYPE=both                  # Options: sol, orb, both
CLAIM_FROM_MINING=true           # Claim from mining rewards
CLAIM_FROM_STAKING=true          # Claim from staking rewards
CHECK_REWARDS_INTERVAL_MS=300000 # How often to check rewards (5 minutes)

# Auto-Deploy Settings
AUTO_DEPLOY_ITERATIONS=0         # Total deployment cycles to run (0 = infinite)
DEPLOY_MAX_RETRIES=3             # Max retries on failed transactions
SMART_ROUND_MANAGEMENT=true      # Intelligently pause between rounds to allow SOL refills
PAUSE_IF_LOW_SOL=true            # Pause deployment if SOL < MIN_SOL_FOR_DEPLOYMENT
RESUME_NEXT_ROUND=true           # Auto-resume on next round after pause/refill

# Jupiter Integration (Swapping & Pricing)
ENABLE_JUPITER_SWAP=true         # Enable automatic ORB->SOL swapping
AUTO_SWAP_WHEN_LOW_SOL=true      # Auto-swap ORB to SOL when SOL balance is low
SWAP_ORB_AMOUNT=50               # Amount of ORB to swap when auto-swapping
MIN_ORB_TO_KEEP=100              # Minimum ORB balance to maintain (don't swap below this)
SLIPPAGE_BPS=50                  # Slippage tolerance in basis points (50 = 0.5%)
JUPITER_API_URL=https://quote-api.jup.ag/v6  # Jupiter API endpoint

# Safety Settings
DRY_RUN=false                    # Simulate without sending transactions
REQUIRE_CONFIRMATION=true        # Ask for confirmation before transactions
MIN_SOL_BALANCE=0.1              # Minimum SOL balance to maintain
RATE_LIMIT_MS=1000               # Minimum delay between operations
```

## Implementation Steps

### Phase 1: Project Setup
1. Initialize TypeScript project with package.json & tsconfig.json
2. Install dependencies
3. Create folder structure
4. Setup .env.example and .gitignore
5. Create basic logger utility

### Phase 2: Core Utilities
1. Build Solana connection utility (RPC setup)
2. Build wallet utility (load keypair from private key)
3. Create account deserialization utilities for:
   - Board account (round_id, start_slot, end_slot)
   - Round account (25 squares, deployed amounts, motherload balance)
   - Miner account (deployed positions, rewards, stats)
4. Create program instruction builders:
   - Deploy instruction (amount, square mask)
   - Claim instruction (SOL/ORE variants)
   - Stake/Withdraw instructions
5. **Build Jupiter integration utility:**
   - Get ORB price in SOL/USD
   - Get swap quote (ORB -> SOL)
   - Execute swap transaction
   - Parse and validate Jupiter responses
6. Implement retry logic with exponential backoff
7. Add balance checking & validation (SOL + ORB)

### Phase 3: Bot Commands
1. **Query Command** - Check all claimable rewards and state
   - Current round ID, timing, and motherload balance
   - **Mining rewards**: Claimable SOL and ORB from miner account
   - **Staking rewards**: Claimable SOL and ORB from stake account
   - Your current deployments across the 25 squares
   - Wallet SOL and ORB balances
   - **ORB price** (via Jupiter): Price in SOL and USD

2. **Deploy Command** - Deploy SOL to all 25 squares
   - Default: Deploy equal amounts to all 25 squares
   - Configurable SOL amount per deployment
   - Balance validation before deployment

3. **Claim Command** - Flexible claiming from mining and staking
   - Claim SOL from mining rewards
   - Claim ORB from mining rewards
   - Claim SOL from staking rewards
   - Claim ORB from staking rewards
   - Support claiming from one or both sources
   - Support claiming one or both token types

4. **Stake Command** - Stake ORB tokens for yield
   - Stake ORB tokens
   - View staking balance and rewards

5. **Swap Command** - Swap ORB to SOL via Jupiter
   - Get swap quote (ORB -> SOL)
   - Display expected output and price impact
   - Execute swap with configurable slippage
   - Manual swap trigger

6. **Auto-Deploy Command** - Fully automated deployment bot:
   - **Smart round management**:
     - Monitor current round end_slot
     - Deploy to all 25 squares only when motherload >= threshold
     - Detect when current round ends
     - Wait for new round to start before next deployment
     - Check SOL balance before each deployment
     - **Pause if SOL < MIN_SOL_FOR_DEPLOYMENT** (allows manual refill)
     - Alert user when paused (low SOL or waiting for motherload)
     - Auto-resume when conditions met (SOL refilled + new round starts)
   - **Auto-swap integration** (Jupiter):
     - If SOL is low and ORB balance is sufficient
     - Automatically swap ORB -> SOL to refill
     - Respect MIN_ORB_TO_KEEP threshold
     - Log swap transactions and rates
   - **Auto-claim integration**:
     - Periodically check mining and staking rewards
     - Auto-claim when thresholds reached
   - Comprehensive logging & error handling with retries

### Phase 4: Safety Features
1. Pre-flight balance checks
2. Dry-run mode (simulate without sending)
3. Transaction confirmation prompts
4. Detailed logging to files
5. Rate limiting between operations
6. Graceful error handling

### Phase 5: Testing & Documentation
1. Test each command with small amounts
2. Write comprehensive README with examples
3. Document all .env options

## Bot Controller Approach
One main bot file (`npm start`) that reads .env configuration to determine what actions to perform:

```json
{
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "nodemon src/index.ts"
  }
}
```

The bot reads `.env` to decide actions:
```


# Action-specific settings follow
```

## Key Technical Approach
- Study ORE program structure from GitHub to understand account layouts
- Manually deserialize Board, Round, and Miner accounts using web3.js
- Build deploy instructions with proper square mask encoding (25-bit bitmask)
- Build claim instructions (separate for SOL and ORE variants)
- Handle PDAs (Program Derived Addresses) for miner, board, and round accounts
- **Integrate Jupiter API v6** for swaps and pricing:
  - Use `/quote` endpoint to get ORB/SOL swap quotes
  - Use `/swap` endpoint to get swap transactions
  - Use `/price` endpoint to get ORB price in SOL/USD
  - Sign and send Jupiter swap transactions
- Implement robust error handling for network issues, insufficient funds, etc.
- Log all transactions with timestamps and results

## Features Summary

### Core Features
1. **Query Rewards & State**
   - View claimable SOL and ORB from **mining** (miner account)
   - View claimable SOL and ORB from **staking** (stake account)
   - Check current round info and motherload balance
   - Monitor wallet SOL and ORB balances
   - **Get ORB price** (via Jupiter) in SOL and USD

2. **Deploy to All 25 Squares**
   - Deploy equal SOL amounts to all 25 squares
   - Only deploy when motherload >= threshold (profitable)
   - Balance validation before deployment

3. **Flexible Claiming**
   - Claim SOL or ORB (or both) from mining rewards
   - Claim SOL or ORB (or both) from staking rewards
   - Configurable auto-claim thresholds

4. **Stake ORB Tokens**
   - Stake ORB for yield
   - View staking balance and rewards

5. **Swap ORB to SOL (Jupiter Integration)**
   - Get real-time swap quotes
   - View price impact and expected output
   - Execute swaps with configurable slippage
   - Manual or automatic swapping

6. **Smart Auto-Deploy Bot**
   - **Intelligent round management**:
     - Deploys to all 25 squares each round
     - Only deploys when motherload >= threshold
     - Monitors round timing to detect round ends
     - Waits for new round before next deployment
     - **Pauses when SOL < minimum** (alerts user to refill)
     - **Auto-resumes** when SOL refilled and new round starts
     - Never misses a round when properly funded
   - **Auto-swap (Jupiter)**:
     - Automatically swaps ORB -> SOL when SOL is low
     - Maintains minimum ORB balance
     - Logs all swap transactions and rates
   - **Integrated auto-claiming**:
     - Periodically checks mining and staking rewards
     - Auto-claims when thresholds reached
   - Full logging, error handling, and retry logic

All CLI-based, no frontend. Private keys and settings in .env file.
