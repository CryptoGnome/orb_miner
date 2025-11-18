# Smart Autonomous ORB Mining Bot

A fully automated TypeScript bot for ORB mining on Solana. Set it up once, and let it mine autonomously with intelligent threshold-based operation.

## What is ORB Mining?

ORB is a **lottery-style mining game** on Solana where:
- Each round has a 5x5 grid (25 squares)
- Miners deploy SOL to squares to participate
- One random square wins the round
- Winners get SOL from losing miners + ORB tokens from the motherload (reward vault)
- This bot deploys to all 25 squares each round to maximize your chances

## Key Features

- **Fully Autonomous** - One command starts everything, zero manual intervention needed
- **Auto-Setup** - Automatically creates and funds automation account on first run
- **Smart Mining** - Price-based profitability analysis using real-time competition data
- **Production Cost Analysis** - Fetches actual on-chain Round data to calculate exact Expected Value (EV)
- **Dynamic Scaling** - Automatically adjusts bet sizes based on motherload changes
- **Auto-Restart** - Recreates automation with optimal amounts when motherload changes significantly
- **Auto-Claim** - Collects your SOL and ORB rewards automatically
- **Auto-Swap** - Converts ORB to SOL to refund the bot when running low
- **Auto-Stake** - Optional staking of excess ORB for additional yield

## Prerequisites

Before you begin, make sure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **A Solana wallet** with some SOL for mining
4. **Your wallet's private key** (base58 format)

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd orb_miner
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Your Wallet

Create a `.env` file in the project root:

```bash
# Copy the example configuration file
cp .env.example .env
```

Edit the `.env` file and add your wallet's private key:

```env
PRIVATE_KEY=your_base58_private_key_here
```

**How to get your private key:**
- Phantom wallet: Settings → Show Private Key (exports in base58 format)
- Solflare wallet: Settings → Export Private Key
- CLI wallet: Use `solana-keygen recover` to get base58 key

**Security Warning:** Never share your private key or commit the `.env` file to Git!

### 4. Fund Your Wallet

Make sure your wallet has enough SOL:
- Minimum: 1 SOL (for testing)
- Recommended: 5+ SOL (for sustained mining)

The bot will use 90% of your SOL balance by default to set up the automation account.

### 5. Review Configuration (Optional)

The `.env` file has sensible defaults, but you can customize:

```env
# Only mine when rewards are >= 100 ORB
MOTHERLOAD_THRESHOLD=100

# Production Cost Analysis (RECOMMENDED - uses real-time competition data)
ENABLE_PRODUCTION_COST_CHECK=true
MIN_EXPECTED_VALUE=0  # Minimum EV in SOL (0 = break-even or better)
ESTIMATED_COMPETITION_MULTIPLIER=20  # Fallback estimate

# Use 90% of wallet SOL for automation setup
INITIAL_AUTOMATION_BUDGET_PCT=90

# Auto-claim rewards when they reach these amounts
AUTO_CLAIM_SOL_THRESHOLD=0.1
AUTO_CLAIM_ORB_THRESHOLD=1.0

# Auto-swap settings to refund automation
AUTO_SWAP_ENABLED=true
WALLET_ORB_SWAP_THRESHOLD=10
MIN_ORB_TO_KEEP=5
MIN_ORB_PRICE_USD=30  # Won't sell below this price

# Optional: Enable auto-staking
AUTO_STAKE_ENABLED=false
STAKE_ORB_THRESHOLD=50
```

See [.env.example](.env.example) for all available options with detailed explanations.

## Running the Bot

### Start Mining

Simply run:

```bash
npm start
```

That's it! The bot will:
1. Check if automation account exists (if not, create it automatically)
2. Start monitoring for new mining rounds
3. Deploy to all 25 squares when profitable
4. Auto-claim rewards periodically
5. Auto-swap ORB to refund itself when low on SOL
6. Keep running until you stop it (Ctrl+C)

### Development Mode (Auto-reload on code changes)

```bash
npm run dev
```

## Monitoring Your Bot

### Watch Logs in Real-Time

```bash
# All logs
tail -f logs/combined.log

# Errors only
tail -f logs/error.log

# Transaction signatures only
tail -f logs/transactions.log
```

### Check Status Manually

While the bot is running, open a new terminal and run:

```bash
npx ts-node tests/test-query.ts
```

This shows:
- Your wallet balances (SOL, ORB)
- Automation account balance
- Claimable rewards
- Current round info
- Motherload size

## Understanding the Output

When running, you'll see messages like:

**Profitability Checking:**
```
[DEBUG] Round 3142: totalDeployed = 7.7691 SOL
[DEBUG] Production Cost Analysis (Profitable):
  Competition: REAL on-chain data (42.5x)
  Your Share: 2.30%
  Production Cost: 0.182800 SOL
  Expected ORB: 0.1123 ORB × 0.123706 SOL = 0.013894 SOL
  Expected SOL Back: 0.173660 SOL
  Expected Value (EV): +0.004754 SOL
  ROI: 2.60%
  Profitable: ✅ YES
```

**Mining:**
```
[INFO] Round 12345 detected (Motherload: 250.00 ORB)
[INFO] Deploying 0.18 SOL across 25 squares
[INFO] Deploy successful: https://solscan.io/tx/...
[INFO] Automation balance: 5.25 SOL remaining
```

**Auto-Claiming:**
```
[INFO] Claimable SOL: 0.15 SOL (>= 0.1 threshold)
[INFO] Claiming SOL rewards...
[INFO] Claimed 0.15 SOL successfully
```

**Unprofitable Conditions:**
```
[WARNING] Unprofitable conditions (EV: -0.001234 SOL) - waiting...
[DEBUG] Motherload: 150.00 ORB, ORB Price: 0.050000 SOL
[DEBUG] Competition too high for current ORB price - skipping round
```

## Stopping the Bot

Press `Ctrl+C` to gracefully stop the bot. It will finish the current operation and exit safely.

## Testing Before Real Mining

To test without spending real SOL:

1. Edit `.env` and set:
   ```env
   DRY_RUN=true
   ```

2. Run the bot:
   ```bash
   npm start
   ```

The bot will simulate all operations without sending actual transactions.

## Cost and Profitability

**Production Cost Analysis (Smart Mining):**

The bot features **intelligent profitability checking** that uses real-time blockchain data:

1. **Fetches actual Round data** - Reads `totalDeployed` from the current Round account
2. **Calculates your exact share** - Determines your percentage of total competition
3. **Gets current ORB price** - Fetches live ORB/SOL price from Jupiter
4. **Computes Expected Value (EV)** - Calculates if mining is profitable:
   ```
   EV = (Expected ORB × ORB Price) + Expected SOL Back - Production Cost
   ```
5. **Only mines when EV > 0** - Skips unprofitable rounds automatically

**Example Calculation:**
- Your deployment: 0.18 SOL/round
- Total competition: 7.77 SOL (from Round account)
- Your share: 2.3% of total deployment
- ORB price: 0.124 SOL ($17.40)
- Expected ORB: 0.112 ORB × 0.124 = 0.014 SOL
- Expected SOL back: 0.174 SOL
- **Expected Value: +0.0048 SOL (2.6% ROI) ✅ PROFITABLE**

**Configuration:**
```env
# Enable/disable production cost checking
ENABLE_PRODUCTION_COST_CHECK=true

# Minimum EV required (0 = break-even or better)
MIN_EXPECTED_VALUE=0

# Fallback estimate when Round data unavailable
ESTIMATED_COMPETITION_MULTIPLIER=20
```

**Costs per Round:**
- Deployment: Variable (bot scales based on motherload size)
- Transaction fees: ~0.001 SOL per deployment
- Swap fees: ~0.5% when converting ORB to SOL

**Key Benefits:**
- ✅ **Accurate decisions** - Uses real competition, not guesses
- ✅ **Protects against losses** - Won't mine when ORB price is too low
- ✅ **Adapts to market** - Automatically adjusts to current conditions
- ✅ **Maximizes EV** - Only deploys when mathematically profitable

## Troubleshooting

### "Insufficient funds" error
- Check your wallet has enough SOL
- Lower `INITIAL_AUTOMATION_BUDGET_PCT` in `.env`
- Fund your wallet with more SOL

### Bot not deploying
- **Profitability check failing** - Bot skips unprofitable rounds when ORB price is low or competition is high
  - Test profitability: `npx ts-node tests/test-live-profitability.ts`
  - Check logs for "Unprofitable conditions" warnings
  - Adjust `MIN_EXPECTED_VALUE` or disable `ENABLE_PRODUCTION_COST_CHECK` if needed
- Check if motherload is below `MOTHERLOAD_THRESHOLD`
- Verify automation account has balance: `npx ts-node tests/check-automation-account.ts`
- Check logs for errors: `tail -f logs/error.log`

### Automation account issues
```bash
# Check automation account status
npx ts-node tests/check-automation-account.ts

# Reset automation (WARNING: loses remaining balance)
npx ts-node tests/test-close-automation.ts
```

### Transaction failures
- Check RPC endpoint is working
- View transaction on [Solscan](https://solscan.io)
- Transaction signatures are logged in `logs/transactions.log`

## Advanced Usage

### Manual Commands

Test individual features:

```bash
# Check balances and status
npx ts-node tests/test-query.ts

# Test profitability analysis with REAL competition data
npx ts-node tests/test-live-profitability.ts

# View accurate profitability breakdown
npx ts-node tests/test-accurate-profitability.ts

# Manual deploy to all 25 squares
npx ts-node tests/test-deploy.ts

# Claim rewards manually
npx ts-node tests/test-claim.ts

# Swap ORB to SOL
npx ts-node tests/test-swap.ts

# Stake ORB tokens
npx ts-node tests/test-stake.ts
```

### Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build

# Clean compiled files
npm run clean
```

## Project Structure

```
orb_miner/
├── src/
│   ├── index.ts              # Entry point
│   ├── commands/
│   │   └── smartBot.ts       # Main autonomous bot
│   ├── utils/                # Core utilities
│   └── types/                # TypeScript types
├── tests/                    # Test scripts
├── logs/                     # Log files
├── .env                      # Your configuration (create this)
├── .env.example              # Configuration template
└── package.json
```

## Technical Documentation

For developers and advanced users, see [CLAUDE.md](CLAUDE.md) for:
- Detailed architecture
- Manual account deserialization
- Instruction format reverse-engineering
- PDA derivation details
- Modifying bot behavior
- Adding new features

## Security Notes

- **Never commit your `.env` file** - It contains your private key
- **Use a dedicated wallet** for bot operations
- **Test with small amounts first** before deploying large sums
- **Keep a backup** of your private key in a secure location
- The `.gitignore` file already excludes `.env` for safety

## Support

- **Issues:** [Open an issue on GitHub](link-to-your-issues)
- **Questions:** Check [CLAUDE.md](CLAUDE.md) for technical details
- **Updates:** Watch this repo for updates

## Disclaimer

This bot interacts with the ORB mining program on Solana mainnet. Mining involves risk:
- You can lose SOL if you don't win rounds
- Smart contract risks (bugs, exploits)
- Network risks (transaction failures, congestion)

**Use at your own risk. Only mine with funds you can afford to lose.**

## License

[Your License Here]

---

**Happy Mining!** If this bot helps you win ORB, consider starring the repo!
