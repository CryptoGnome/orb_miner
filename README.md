# 🤖 ORB Autonomous Mining Bot

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-14F195?style=flat&logo=solana)](https://solana.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](LICENSE)

Fully autonomous Solana mining bot with Monte Carlo-optimized bet sizing, real-time profitability analysis, and Next.js dashboard.
<img width="1901" height="955" alt="image" src="https://github.com/user-attachments/assets/0170c488-9199-46ef-9422-f4b5bf0fcf44" />


**+139% Avg ROI** • Monte Carlo Optimized • Real-Time EV • Dynamic Scaling

---

## 📚 New to Node.js, Servers, or Mining Bots?

**Complete Beginner's Installation Guide:** [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)

This comprehensive guide covers everything step-by-step:
- ✅ Installing prerequisites (Node.js, Git, etc.)
- ✅ Creating and securing your Solana wallet
- ✅ Detailed installation for Windows, Mac, and Linux
- ✅ First-time setup with screenshots explanations
- ✅ Monitoring, updating, and troubleshooting
- ✅ 24/7 server deployment guide

**Already familiar with Node.js?** Continue with the Quick Start below.

---

## What is ORB?

ORB is a lottery-style mining game on Solana where miners deploy SOL to a 5x5 grid (25 blocks). One random block wins each round, and all miners on that block share the rewards: SOL from losers + 4 ORB + motherload bonus (1/625 chance).

**This bot deploys to all 25 blocks** to maximize win probability and uses mathematical optimization to determine optimal bet sizing.

---

## Quick Start

> ⚠️ **Use a FRESH, dedicated wallet** - Never use your main wallet!

### Option 1: Local Development (Easiest)

For running on your local computer with automatic browser setup:

```bash
# 1. Clone and install
git clone https://github.com/CryptoGnome/orb_miner.git
cd orb_miner
npm run setup

# 2. Fund wallet with 1-5+ SOL

# 3. Start bot + dashboard together
npm start

# 4. Browser opens automatically to setup wizard
# Enter your PRIVATE_KEY (encrypted & stored securely)
# Optional: Custom RPC endpoint
# Optional: Dashboard password

# 5. That's it! Mining starts automatically
```

The bot handles everything: deployments, claims, swaps, and restarts. Press `Ctrl+C` to stop.

**Monitor Dashboard:** [http://localhost:3888](http://localhost:3888)
**Change Settings:** [http://localhost:3888/settings](http://localhost:3888/settings) _(no restart needed!)_

---

### Option 2: Server Deployment (Production)

For running 24/7 on a Linux server (VPS, dedicated server, etc.):

```bash
# 1. Clone and install
git clone https://github.com/CryptoGnome/orb_miner.git
cd orb_miner
npm run setup

# 2. Fund wallet with 1-5+ SOL

# 3. Start DASHBOARD FIRST (for initial setup)
npm run start:dashboard
# Dashboard runs on http://YOUR_SERVER_IP:3888

# 4. Access setup wizard from your browser
# Visit: http://YOUR_SERVER_IP:3888/setup
# Enter your PRIVATE_KEY (encrypted & stored securely)
# IMPORTANT: Set a strong dashboard password for remote access!
# Optional: Custom RPC endpoint

# 5. Stop dashboard (Ctrl+C) after setup is complete

# 6. Start with PM2 for 24/7 operation
npm install -g pm2
pm2 start npm --name "orb-bot" -- run start:bot && pm2 start npm --name "orb-dashboard" -- run start:dashboard
pm2 save
pm2 startup  # Follow the instructions it gives you

# 7. Monitor with PM2
pm2 logs              # View all logs (real-time)
pm2 logs orb-bot      # Bot logs only
pm2 logs orb-dashboard # Dashboard logs only
pm2 status            # Check status
pm2 restart orb-bot orb-dashboard    # Restart both processes (SAFE)
```

**Access Dashboard Remotely:** `http://YOUR_SERVER_IP:3888`

**Why dashboard first?** The bot requires `PRIVATE_KEY` to be configured before it can run. The dashboard provides a secure web interface to configure this and other critical settings.

<details>
<summary>📋 <b>Detailed Setup Instructions</b></summary>

### Prerequisites
- Node.js v16+ ([Download](https://nodejs.org/))
- Fresh Solana wallet (create new, don't reuse existing)
- 1-5+ SOL for mining
- Base58 private key

### Setup Steps

1. **Clone repository**
   ```bash
   git clone https://github.com/CryptoGnome/orb_miner.git
   cd orb_miner
   ```

2. **Install dependencies**
   ```bash
   npm run setup  # Installs bot + dashboard dependencies
   ```

3. **Fund wallet**
   - Minimum: 1 SOL (testing)
   - Recommended: 5+ SOL (sustained mining)

4. **Start bot + dashboard**
   ```bash
   npm start  # Runs bot AND dashboard
   ```

   Browser automatically opens to setup wizard

5. **Complete setup wizard**
   - Enter your Base58 private key (encrypted with AES-256-GCM)
   - Optional: Custom RPC endpoint (has default)
   - Click "Complete Setup"

   **Export private key from Phantom:** Settings → Show Private Key

6. **Bot starts mining automatically!**

   Or run components separately:
   ```bash
   npm run start:bot        # Bot only
   npm run start:dashboard  # Dashboard only
   ```

6. **Monitor logs** (optional, new terminal)
   ```bash
   tail -f logs/combined.log
   ```

</details>

---

## Key Features

**🧠 Intelligence**
- Monte Carlo optimized (10,000 simulations per tier)
- Real-time EV calculation before every deployment
- Kelly Criterion-inspired bankroll management
- Dynamic scaling with motherload changes

**⚡ Automation**
- Fully autonomous operation
- Web-based setup wizard (auto-opens browser)
- Live settings updates (no restart needed!)
- Auto-claim rewards (SOL/ORB)
- Auto-swap ORB → SOL with price floor protection
- Auto-restart when motherload changes 40-50%+
- Dynamic priority fees (saves 90%+ during quiet periods)

**🛡️ Safety**
- Only mines when EV > 0
- Motherload threshold gating
- Price floor protection
- Balance reserves
- Full transaction transparency

**📊 Monitoring & Management**
- Next.js 16 dashboard with real-time stats
- User-friendly settings page (60+ options)
- SQLite-based configuration & PnL tracking
- Transaction history
- Round analytics
- No .env files needed!

---

## Essential Commands

```bash
# Running
npm start                  # Start bot + dashboard
npm run start:bot          # Bot only
npm run start:dashboard    # Dashboard only (port 3888)

# Building
npm run build             # Compile TypeScript bot
npm run build:dashboard   # Build Next.js dashboard

# Testing
npx ts-node tests/test-query.ts              # Check balances & status
npx ts-node tests/test-live-profitability.ts # Check profitability
npx ts-node tests/test-fee-estimation.ts     # Test RPC fee support

# Utilities
npm run pnl:reconcile     # Reconcile P&L data
npm run simulate          # Run Monte Carlo simulations
```

<details>
<summary>🛠️ <b>More Commands</b></summary>

```bash
# Manual Operations
npx ts-node tests/test-deploy.ts        # Manual deploy to all 25 squares
npx ts-node tests/test-claim.ts         # Claim rewards manually
npx ts-node tests/test-swap.ts          # Swap ORB to SOL
npx ts-node tests/test-stake.ts         # Stake ORB tokens
npx ts-node tests/test-close-automation.ts  # Close automation account

# Profitability Analysis
npx ts-node tests/test-accurate-profitability.ts  # Detailed EV breakdown

# Account Management
npx ts-node tests/check-automation-account.ts     # Check automation status

# Development
npm run dev               # Bot with nodemon auto-reload
npm run clean            # Remove dist/ directory
npm run pnl:reset        # Reset P&L tracking
```

</details>

---

## 🚀 Production Deployment with PM2

For running the bot 24/7 on a Linux server, see **[Option 2: Server Deployment](#option-2-server-deployment-production)** above for complete setup instructions.

### Important Setup Order for Servers

1. ✅ **Dashboard first** - Run `npm run start:dashboard` to access setup wizard
2. ✅ **Configure settings** - Visit `http://YOUR_SERVER_IP:3888/setup` and set PRIVATE_KEY + password
3. ✅ **Start with PM2** - Use the PM2 start command below for 24/7 operation

**Why this order?** The bot cannot start without `PRIVATE_KEY` configured. The dashboard provides a secure web interface to set this up remotely.

### PM2 Start Command
```bash
pm2 start npm --name "orb-bot" -- run start:bot && pm2 start npm --name "orb-dashboard" -- run start:dashboard
pm2 save
```

### Updating & Restarting

When new features are released, update your bot safely:

```bash
cd ~/orb_miner

# 1. Pull latest changes
git pull

# 2. Install any new dependencies (if package.json changed)
npm install
cd dashboard && npm install && cd ..

# 3. Rebuild (if code changed)
npm run build
npm run build:dashboard

# 4. Restart ONLY orb miner processes (safe for shared servers)
pm2 restart orb-bot orb-dashboard

# 5. Verify it's working
pm2 logs orb-bot --lines 20
```

**Important:** Use `pm2 restart orb-bot orb-dashboard` instead of `pm2 restart all` if you have other PM2 processes running. This ensures only the bot is restarted, not your other services!

### PM2 Management Commands

```bash
# View status
pm2 list
pm2 status

# View logs (real-time)
pm2 logs                # All processes
pm2 logs orb-bot        # Bot only
pm2 logs orb-dashboard  # Dashboard only

# Restart processes (recommended - safe methods)
pm2 restart orb-bot orb-dashboard    # Restart only orb miner by name (RECOMMENDED)
# CAUTION: Only use 'pm2 restart all' if no other PM2 processes are running!
pm2 stop orb-bot orb-dashboard       # Stop only orb miner
pm2 delete orb-bot orb-dashboard     # Remove from PM2

# Save and auto-start on reboot
pm2 save
pm2 startup  # Follow the instructions it outputs

# Monitor resources
pm2 monit
```

### PM2 Logs

All logs are automatically captured by PM2 and stored in `~/.pm2/logs/`:

- `~/.pm2/logs/orb-bot-out.log` - Bot output
- `~/.pm2/logs/orb-bot-error.log` - Bot errors
- `~/.pm2/logs/orb-dashboard-out.log` - Dashboard output
- `~/.pm2/logs/orb-dashboard-error.log` - Dashboard errors

View logs in real-time: `pm2 logs` or `pm2 logs orb-bot` or `pm2 logs orb-dashboard`

---

## 📊 Monitoring

### Real-Time Dashboard
Open [http://localhost:3888](http://localhost:3888) when bot is running to see:
- Live balances and PnL
- Recent transactions
- Round history
- Analytics and charts

### Log Files
```bash
tail -f logs/combined.log      # All logs
tail -f logs/error.log          # Errors only
tail -f logs/transactions.log   # Transaction signatures
```

### Quick Status Check
```bash
npx ts-node tests/test-query.ts
```
Shows: Wallet balances, automation balance, claimable rewards, current round, motherload

---

## 🧠 How It Works

<details>
<summary>📐 <b>Monte Carlo Optimization</b></summary>

The bot uses **10,000-simulation Monte Carlo analysis** to determine optimal bet sizing for each motherload tier.

### Optimized Tiers

| Motherload | Rounds | SOL/Round | Avg ROI | Strategy |
|------------|--------|-----------|---------|----------|
| 1200+ ORB  | 60     | ~1.67%    | **+76%** | Ultra Aggressive |
| 1000-1099 ORB | 120  | ~0.83%    | **+125%** | Very Aggressive |
| 700-799 ORB | 240   | ~0.42%    | **+172%** | **PEAK** |
| 500-599 ORB | 320   | ~0.31%    | **+165%** | Conservative |
| 300-399 ORB | 400   | ~0.25%    | **+125%** | Ultra Conservative |
| 200-299 ORB | 440   | ~0.23%    | **+74%** | Maximum Safety |

*Based on 10,000 simulations per tier with 20x competition*

**Why This Matters:**
- Each tier was tested through thousands of simulations
- Maximizes ROI while keeping risk of ruin < 5%
- Accounts for 1/625 win chance, competition, and fees
- Proven +139% average ROI vs +74% with naive strategies

Run simulations yourself: `npm run simulate`

</details>

<details>
<summary>📊 <b>Real-Time EV Calculation</b></summary>

The bot calculates Expected Value (EV) **before every deployment** using live on-chain data:

1. **Fetches Live Competition** - Reads `totalDeployed` from Round account
2. **Calculates Your Share** - Determines exact % of total deployment
3. **Gets Current ORB Price** - Fetches live price from Jupiter DEX
4. **Computes EV**:
   ```
   Expected ORB = Your Share × (4 ORB + Motherload/625)
   Expected ORB (post-fee) = Expected ORB × 0.9
   Expected SOL Back = Your Deployment × 0.95

   EV = (Expected ORB × ORB Price) + Expected SOL Back - Your Deployment
   ```
5. **Only Mines When EV > 0** - Skips unprofitable rounds

### Example Calculation
```
Your Deployment: 0.18 SOL
Total Competition: 7.77 SOL (live on-chain data)
Your Share: 2.3%
ORB Price: 0.124 SOL ($24.80)

Expected ORB: 0.112 ORB × 0.124 = 0.014 SOL
Expected SOL Back: 0.174 SOL
Expected Value: +0.008 SOL (4.4% ROI) ✅ PROFITABLE
```

This protects you from mining when competition is too high or ORB price drops.

</details>

<details>
<summary>🔄 <b>Dynamic Scaling & Auto-Restart</b></summary>

The bot continuously monitors motherload and automatically adjusts:

- **50%+ Increase**: Closes automation, recreates with larger bets
  - Example: 300 → 500 ORB = 67% larger bets to maximize EV
- **40%+ Decrease**: Closes automation, recreates with smaller bets
  - Example: 500 → 280 ORB = 44% smaller bets to preserve capital

**Benefits:**
- Always betting optimally for current conditions
- No manual intervention needed
- Reclaims remaining SOL before restart (nothing wasted)

</details>

<details>
<summary>🛡️ <b>Safety Features</b></summary>

Multiple layers of protection prevent losses:

1. **Motherload Threshold** - Won't mine unless rewards >= threshold (default: 100 ORB)
2. **EV Gating** - Skips rounds where EV < 0
3. **Price Floor** - Won't swap ORB below minimum USD price (default: $30)
4. **Balance Reserves** - Maintains minimum SOL/ORB balances
5. **Fractional Betting** - Never risks >1.67% per round (even at max aggression)
6. **Auto-Depletion Detection** - Closes automation when budget exhausted

</details>

<details>
<summary>⚡ <b>Dynamic Fee Optimization</b></summary>

The bot auto-detects RPC fee estimation support and optimizes transaction fees:

- **RPC Detection**: Supports Helius, Triton, QuickNode fee APIs
- **Network-Based Fees**: Adjusts based on real-time congestion
- **Cost Savings**: 90%+ savings during quiet periods
- **Reliable Landing**: Ensures txs land during busy periods

**Test your RPC:**
```bash
npx ts-node tests/test-fee-estimation.ts
```

**Recommended RPCs:**
- [Helius](https://helius.dev) - Most accurate
- [Triton](https://triton.one) - High performance
- [QuickNode](https://quicknode.com) - Reliable free tier

See [FEE_OPTIMIZATION.md](FEE_OPTIMIZATION.md) for details.

</details>

---

## ⚙️ Configuration

<details>
<summary><b>Configuration Options</b></summary>

**All settings managed via dashboard** at http://localhost:3888/settings

No .env file needed! Key settings:

```
# Mining Thresholds
MOTHERLOAD_THRESHOLD: 100               # Min motherload to mine
ENABLE_PRODUCTION_COST_CHECK: true     # Gate on EV > 0 (recommended)
MIN_EXPECTED_VALUE: 0                  # Min EV in SOL

# Budget Allocation
INITIAL_AUTOMATION_BUDGET_PCT: 90      # % of wallet SOL for automation

# Auto-Claim
AUTO_CLAIM_SOL_THRESHOLD: 0.1          # Claim when >= 0.1 SOL
AUTO_CLAIM_ORB_THRESHOLD: 1.0          # Claim when >= 1.0 ORB

# Auto-Swap
AUTO_SWAP_ENABLED: true                # Auto-swap ORB → SOL
WALLET_ORB_SWAP_THRESHOLD: 0.1         # Swap when >= 0.1 ORB
MIN_ORB_PRICE_USD: 30                  # Won't sell below $30

# Auto-Stake (optional)
AUTO_STAKE_ENABLED: false              # Enable ORB staking
STAKE_ORB_THRESHOLD: 50                # Stake when >= 50 ORB

# Priority Fees
PRIORITY_FEE_LEVEL: medium             # low/medium/high/veryHigh
MIN_PRIORITY_FEE_MICRO_LAMPORTS: 100
MAX_PRIORITY_FEE_MICRO_LAMPORTS: 50000

# Testing
DRY_RUN: false                         # Simulate without real txs
```

**Configuration Features:**
- ✅ Web-based settings editor
- ✅ AES-256 encryption for sensitive data
- ✅ **Live updates** - changes take effect without restart!
- ✅ 60+ configurable settings
- ✅ Input validation & safety checks
- ✅ Stored in SQLite database

See dashboard settings page for full list with descriptions.

</details>

---

## 💰 Development Fee

This bot includes a **0.5% development fee** on each deployment to support ongoing development and maintenance.

Example: Deploy 1 SOL → 0.005 SOL fee (0.5%) + 0.995 SOL for mining

---

## 🔧 Troubleshooting

<details>
<summary><b>Common Issues</b></summary>

### Bot not deploying
- **Check profitability:** `npx ts-node tests/test-live-profitability.ts`
- **Check logs:** `tail -f logs/combined.log`
- Possible reasons:
  - EV < 0 (competition too high or ORB price too low)
  - Motherload below threshold
  - Automation account depleted

### "Insufficient funds" error
- Check wallet balance: `npx ts-node tests/test-query.ts`
- Lower `INITIAL_AUTOMATION_BUDGET_PCT` in dashboard settings
- Fund wallet with more SOL

### Automation account issues
```bash
# Check status
npx ts-node tests/check-automation-account.ts

# Close and restart (reclaims remaining balance)
npx ts-node tests/test-close-automation.ts
```

### Transaction failures
- Check RPC endpoint is working
- View tx on [Solscan](https://solscan.io)
- Tx signatures logged in `logs/transactions.log`

### Test with dry run
Set `DRY_RUN=true` in dashboard settings to simulate without real transactions

</details>

---

## 🧪 Testing Before Real Mining

1. Set `DRY_RUN=true` in dashboard settings (http://localhost:3888/settings)
2. Run `npm start`
3. Bot will simulate all operations without sending real transactions

**Profitability Check:**
```bash
npx ts-node tests/test-live-profitability.ts
```

---

## 🔒 Security

### Best Practices
- ✅ **Use a FRESH, dedicated wallet** - Create new wallet specifically for this bot
- ✅ Never use your main wallet with significant holdings
- ✅ Test with small amounts first (1-2 SOL)
- ✅ Keep offline backup of private key
- ✅ Monitor logs regularly
- ✅ Use reputable RPC endpoints
- ✅ Protect database file (`data/orb_mining.db`) with proper file permissions

### Built-in Protections
- **AES-256-GCM encryption** for sensitive data (PRIVATE_KEY)
- Encryption key unique per installation
- Multi-layer safety checks
- Balance reserves
- Price floor protection
- EV-based gating
- Input validation on all settings

---

## ⚠️ Disclaimer

**BETA SOFTWARE** - Use caution and start with small amounts.

### Risks
- 💸 **Capital Risk** - You can lose SOL if you don't win rounds
- 🐛 **Smart Contract Risk** - Bugs or exploits in ORB/ORE contracts
- 🌐 **Network Risk** - Transaction failures, congestion, RPC issues
- 📉 **Market Risk** - ORB price volatility affects profitability
- 🎲 **Lottery Risk** - No guaranteed returns (1/625 chance per round)

**USE AT YOUR OWN RISK. Only mine with funds you can afford to lose.**

This software is provided "as-is" without warranty of any kind. The developers are not responsible for any losses incurred.

---

## 💬 Support

[![GitHub Issues](https://img.shields.io/badge/Issues-Report%20Bug-red?style=flat&logo=github)](https://github.com/CryptoGnome/orb_miner/issues)
[![ORB Protocol](https://img.shields.io/badge/ORB-ore.blue-purple?style=flat&logo=solana)](https://ore.blue/)

**Questions?** Open an issue

**Updates?** Star/Watch this repo to stay notified

---

<div align="center">

### 🌟 If this bot helps you win ORB, consider starring the repo!

**Made with ❤️ by the community**

[![GitHub stars](https://img.shields.io/github/stars/CryptoGnome/orb_miner?style=social)](https://github.com/CryptoGnome/orb_miner/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/CryptoGnome/orb_miner?style=social)](https://github.com/CryptoGnome/orb_miner/network/members)

---

**Happy Mining! 🚀**

*Powered by Monte Carlo optimization and real-time EV analysis*

</div>
