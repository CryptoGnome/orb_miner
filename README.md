# ORB Mining Bot

Automated TypeScript CLI bot for ORB mining on Solana with Jupiter swap integration.

## Features

- **Query State**: Check claimable rewards, round info, motherload balance, and ORB price
- **Deploy**: Deploy SOL to all 25 squares in the lottery
- **Claim**: Claim SOL/ORB rewards from mining and staking
- **Stake**: Stake ORB tokens for yield
- **Swap**: Swap ORB to SOL via Jupiter aggregator
- **Auto-Deploy**: Fully automated mining bot with:
  - Smart round management (waits for new rounds)
  - Motherload threshold checking
  - Auto-claim when rewards reach threshold
  - Auto-swap ORB→SOL when SOL is low
  - Intelligent pause/resume on low balance

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your details:

```bash
cp .env.example .env
```

**Required Configuration:**
- `PRIVATE_KEY`: Your wallet's base58-encoded private key
- `RPC_ENDPOINT`: Solana RPC endpoint (e.g., Helius, QuickNode)
- `ORB_PROGRAM_ID`: ORB program address (already set)
- `ORB_TOKEN_MINT`: ORB token mint address

**Important Settings:**
- `BOT_ACTION`: Which command to run (query, deploy, claim, stake, swap, auto-deploy)
- `SOL_PER_DEPLOYMENT`: Amount of SOL to deploy per round
- `MOTHERLOAD_THRESHOLD`: Only mine when motherload >= this value
- `MIN_SOL_FOR_DEPLOYMENT`: Pause if SOL drops below this

### 3. Run the Bot

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Commands

### Query

Check all balances, rewards, and current round info:

```bash
# Set BOT_ACTION=query in .env
npm start
```

Shows:
- Wallet SOL and ORB balances
- ORB price (SOL and USD)
- Current round info and motherload
- Claimable rewards from mining and staking
- Lifetime earnings

### Deploy

Deploy SOL to all 25 squares once:

```bash
# Set BOT_ACTION=deploy in .env
npm start
```

### Claim

Claim accumulated rewards:

```bash
# Set BOT_ACTION=claim in .env
npm start
```

Configure in `.env`:
- `CLAIM_TYPE`: sol, orb, or both
- `CLAIM_FROM_MINING`: true/false
- `CLAIM_FROM_STAKING`: true/false

### Stake

Stake ORB tokens for yield:

```bash
# Set BOT_ACTION=stake in .env
npm start
```

### Swap

Manually swap ORB to SOL via Jupiter:

```bash
# Set BOT_ACTION=swap in .env
npm start
```

Configure in `.env`:
- `SWAP_ORB_AMOUNT`: Amount to swap
- `SLIPPAGE_BPS`: Slippage tolerance (50 = 0.5%)

### Auto-Deploy (Main Bot)

Fully automated mining bot:

```bash
# Set BOT_ACTION=auto-deploy in .env
npm start
```

**How it works:**
1. Monitors current round
2. When new round starts:
   - Checks motherload >= threshold
   - Checks SOL balance >= minimum
   - If SOL low, auto-swaps ORB→SOL (if enabled)
   - Deploys to all 25 squares
3. Periodically checks and auto-claims rewards
4. Repeats for next round

**Key Features:**
- **Smart Round Management**: Never misses a round
- **Auto-Swap**: Automatically converts ORB to SOL when low
- **Auto-Claim**: Claims rewards when thresholds reached
- **Pause/Resume**: Pauses on low balance, resumes when refilled
- **Graceful Shutdown**: Press Ctrl+C to stop safely

## Configuration Reference

### Deployment Settings

```env
SOL_PER_DEPLOYMENT=0.01          # SOL to deploy per round
MOTHERLOAD_THRESHOLD=50          # Only deploy if motherload >= this
MIN_SOL_FOR_DEPLOYMENT=0.3       # Pause if SOL < this
CHECK_ROUND_INTERVAL_MS=30000    # How often to check for new rounds
```

### Claim Settings

```env
AUTO_CLAIM_ENABLED=true          # Enable auto-claiming
CLAIM_THRESHOLD_SOL=1.0          # Auto-claim when SOL >= this
CLAIM_THRESHOLD_ORB=100          # Auto-claim when ORB >= this
CLAIM_TYPE=both                  # sol, orb, or both
CLAIM_FROM_MINING=true           # Claim from mining rewards
CLAIM_FROM_STAKING=true          # Claim from staking rewards
```

### Jupiter Swap Settings

```env
ENABLE_JUPITER_SWAP=true         # Enable Jupiter integration
AUTO_SWAP_WHEN_LOW_SOL=true      # Auto-swap when SOL low
SWAP_ORB_AMOUNT=50               # Amount to swap per operation
MIN_ORB_TO_KEEP=100              # Never swap below this
SLIPPAGE_BPS=50                  # 0.5% slippage tolerance
```

### Safety Settings

```env
DRY_RUN=false                    # Simulate without sending txs
REQUIRE_CONFIRMATION=false       # Ask before each tx (not recommended for auto-deploy)
MIN_SOL_BALANCE=0.1              # Maintain this minimum
RATE_LIMIT_MS=1000               # Delay between operations
```

## How ORB Mining Works

ORB is a lottery-style mining game, not traditional proof-of-work:

1. Each round has a **5x5 grid (25 squares)**
2. Miners **deploy SOL** to one or more squares
3. At round end, a **random square wins**
4. A **random miner** within that square gets the rewards
5. **Rewards = SOL from losing miners + ORB from motherload**

The bot deploys to **all 25 squares** each round to maximize winning chances.

## Logs

All logs are saved to the `logs/` directory:
- `combined.log`: All log messages
- `error.log`: Errors only
- `transactions.log`: All transaction signatures

## Safety Tips

1. **Start Small**: Test with small amounts first
2. **Monitor Logs**: Check logs regularly for issues
3. **Keep SOL**: Maintain enough SOL for transaction fees
4. **Motherload Threshold**: Set appropriately to avoid unprofitable rounds
5. **Dry Run**: Use `DRY_RUN=true` to test without spending

## Troubleshooting

**Bot keeps pausing due to low SOL:**
- Enable `AUTO_SWAP_WHEN_LOW_SOL=true`
- Increase `SWAP_ORB_AMOUNT`
- Manually add more SOL to your wallet

**Motherload always below threshold:**
- Lower `MOTHERLOAD_THRESHOLD`
- Check current motherload with `BOT_ACTION=query`

**Transactions failing:**
- Check RPC endpoint is working
- Ensure sufficient SOL for fees
- Check `logs/error.log` for details

**Jupiter swap failing:**
- Check `SLIPPAGE_BPS` (try increasing)
- Verify ORB token balance
- Ensure Jupiter API is accessible

## Support

For issues, check:
1. Logs in `logs/` directory
2. Configuration in `.env`
3. ORB program status on Solana explorer

## License

MIT
