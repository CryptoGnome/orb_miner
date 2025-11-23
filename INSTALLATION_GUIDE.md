# Complete Beginner's Installation Guide

**Welcome!** This guide will walk you through setting up the ORB Mining Bot from scratch, even if you've never used Node.js, servers, or command-line tools before.

---

## Table of Contents

1. [Prerequisites & Downloads](#prerequisites--downloads)
2. [Creating Your Solana Wallet](#creating-your-solana-wallet)
3. [Installation by Operating System](#installation-by-operating-system)
   - [Windows](#windows-installation)
   - [Mac](#mac-installation)
   - [Linux / Ubuntu Server](#linux--ubuntu-server-installation)
4. [First-Time Setup (Web Dashboard)](#first-time-setup-web-dashboard)
5. [Running Your Bot](#running-your-bot)
6. [Monitoring Your Bot](#monitoring-your-bot)
7. [Updating Your Bot](#updating-your-bot)
8. [24/7 Server Setup (Advanced)](#247-server-setup-advanced)
9. [Troubleshooting](#troubleshooting)
10. [FAQ](#faq)

---

## Prerequisites & Downloads

Before installing the bot, you'll need to download and install a few free programs:

### 1. Node.js (Required)

**What it is:** The runtime environment that runs the bot.

**Download:** [https://nodejs.org/](https://nodejs.org/)

- **Recommended Version:** LTS (Long Term Support) - currently v20 or v22
- **Minimum Required:** v16 or higher

**Installation:**
- Download the installer for your operating system
- Run the installer (use default settings)
- This will also install `npm` (Node Package Manager)

**Verify Installation:**
```bash
node --version
npm --version
```
You should see version numbers like `v22.x.x` and `9.x.x`

### 2. Git (Required)

**What it is:** Version control tool used to download the bot code.

**Download:** [https://git-scm.com/downloads](https://git-scm.com/downloads)

**Installation:**
- Download the installer for your operating system
- Run the installer (use default settings)

**Verify Installation:**
```bash
git --version
```
You should see something like `git version 2.x.x`

### 3. Visual Studio Build Tools (Windows Only)

**What it is:** Required to compile native modules (sqlite3 database).

**Download:** [https://visualstudio.microsoft.com/downloads/](https://visualstudio.microsoft.com/downloads/)

**Installation:**
- Scroll down to "Tools for Visual Studio"
- Download "Build Tools for Visual Studio 2022"
- During installation, select "Desktop development with C++"
- This is a large download (several GB) but necessary for Windows users

**Alternative (simpler):** Install via npm:
```bash
npm install --global windows-build-tools
```

### 4. Solana (Recommended)

**What it is:** You'll need SOL (Solana's cryptocurrency) in your wallet to run the bot.

**How much:**
- **Testing:** 1-2 SOL minimum
- **Sustained Mining:** 5+ SOL recommended
- **Optimal:** 10+ SOL

**Where to buy:** Any major cryptocurrency exchange (Coinbase, Binance, Kraken, etc.)

---

## Creating Your Solana Wallet

The bot needs a **dedicated wallet** to operate. Never use your main wallet with significant holdings.

### Option 1: Phantom Wallet (Easiest)

1. **Install Phantom:** [https://phantom.app/](https://phantom.app/)
   - Available as browser extension (Chrome, Firefox, Edge)
   - Also available as mobile app

2. **Create New Wallet:**
   - Click "Create New Wallet"
   - Write down your 12-word recovery phrase on paper
   - Store it somewhere safe (offline)

3. **Export Private Key:**
   - Click the settings icon (gear)
   - Go to "Security & Privacy"
   - Click "Export Private Key"
   - Enter your password
   - **Copy the private key** (long string of characters)
   - You'll need this for bot setup

4. **Fund Your Wallet:**
   - Copy your wallet address (click to copy)
   - Send SOL from an exchange to this address
   - Wait for confirmation (usually 1-2 minutes)

### Option 2: Solflare Wallet

1. **Install Solflare:** [https://solflare.com/](https://solflare.com/)
   - Browser extension or web wallet

2. **Create Wallet & Export Key:**
   - Similar process to Phantom
   - Settings > Export Private Key

### Option 3: Solana CLI (Advanced Users)

If you're comfortable with command-line:

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Generate new keypair
solana-keygen new --outfile ~/bot-wallet.json

# Display private key
solana-keygen pubkey ~/bot-wallet.json
cat ~/bot-wallet.json
```

### Security Checklist

- Create a **NEW** wallet specifically for the bot
- Never use a wallet with significant holdings
- Store your recovery phrase offline
- Never share your private key with anyone
- The bot encrypts your key in the database, but always be cautious

---

## Installation by Operating System

Choose your operating system below:

---

## Windows Installation

### Step 1: Open Command Prompt or PowerShell

**Method 1:**
- Press `Windows Key + R`
- Type `cmd` and press Enter

**Method 2:**
- Right-click Start menu
- Select "Windows PowerShell" or "Terminal"

### Step 2: Navigate to Your Desired Folder

Choose where you want to install the bot (e.g., Desktop):

```bash
cd Desktop
```

Or create a new folder:

```bash
mkdir BotProjects
cd BotProjects
```

### Step 3: Download the Bot

```bash
git clone https://github.com/CryptoGnome/orb_miner.git
cd orb_miner
```

**What this does:** Downloads all the bot files from GitHub to your computer.

### Step 4: Install Dependencies

```bash
npm run setup
```

**What this does:** Downloads and installs all required libraries and tools.

**This may take 5-10 minutes.** You'll see lots of text scrolling - this is normal.

**Common Issue:** If you see errors about "node-gyp" or "sqlite3", you need to install [Visual Studio Build Tools](#3-visual-studio-build-tools-windows-only).

### Step 5: Build the Bot

```bash
npm run build
```

**What this does:** Converts TypeScript code to JavaScript that Node.js can run.

### Step 6: Verify Installation

Check that everything compiled successfully:

```bash
npm run build
npm run build:dashboard
```

If you see no errors, you're ready to continue to [First-Time Setup](#first-time-setup-web-dashboard)!

---

## Mac Installation

### Step 1: Open Terminal

**Method 1:**
- Press `Command + Space`
- Type "Terminal"
- Press Enter

**Method 2:**
- Open Finder
- Go to Applications > Utilities > Terminal

### Step 2: Navigate to Your Desired Folder

```bash
cd ~/Desktop
```

Or create a projects folder:

```bash
mkdir -p ~/BotProjects
cd ~/BotProjects
```

### Step 3: Install Xcode Command Line Tools (if not already installed)

```bash
xcode-select --install
```

**What this does:** Installs build tools needed for native modules.

### Step 4: Download the Bot

```bash
git clone https://github.com/CryptoGnome/orb_miner.git
cd orb_miner
```

### Step 5: Install Dependencies

```bash
npm run setup
```

**This may take 5-10 minutes.** Get a coffee!

### Step 6: Build the Bot

```bash
npm run build
```

### Step 7: Verify Installation

```bash
npm run build
npm run build:dashboard
```

If no errors appear, proceed to [First-Time Setup](#first-time-setup-web-dashboard)!

---

## Linux / Ubuntu Server Installation

### Step 1: Connect to Your Server

If you're using a remote server:

```bash
ssh your-username@your-server-ip
```

### Step 2: Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 3: Install Node.js (if not already installed)

**Using NodeSource (Recommended):**

```bash
# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verify:**
```bash
node --version
npm --version
```

### Step 4: Install Git (if not already installed)

```bash
sudo apt install git -y
```

### Step 5: Install Build Tools

```bash
sudo apt install build-essential -y
```

**What this does:** Installs compilers needed for native modules (sqlite3).

### Step 6: Download the Bot

```bash
cd ~
git clone https://github.com/CryptoGnome/orb_miner.git
cd orb_miner
```

### Step 7: Install Dependencies

```bash
npm run setup
```

**This may take 5-10 minutes.**

### Step 8: Build the Bot

```bash
npm run build
npm run build:dashboard
```

### Step 9: Configure Firewall (for remote access)

If you want to access the dashboard remotely:

```bash
sudo ufw allow 3888/tcp
sudo ufw reload
```

**What this does:** Opens port 3888 so you can access the dashboard from your browser.

### Step 10: Verify Installation

```bash
npm run build
npm run build:dashboard
```

If no errors, proceed to [First-Time Setup](#first-time-setup-web-dashboard)!

---

## First-Time Setup (Web Dashboard)

The bot uses a **web-based setup wizard** - no need to edit configuration files!

### Step 1: Start the Dashboard

In your terminal/command prompt (in the `orb_miner` folder):

```bash
npm start
```

**What this does:** Starts both the bot and the web dashboard.

**You'll see output like:**
```
Starting ORB Miner Bot and Dashboard...
Dashboard running on http://localhost:3888
Bot is starting...
```

### Step 2: Open the Setup Wizard

The setup wizard should automatically open in your browser. If it doesn't:

**Local Machine:**
- Open your browser
- Go to: `http://localhost:3888/setup`

**Remote Server:**
- Open your browser
- Go to: `http://YOUR_SERVER_IP:3888/setup`
- Replace `YOUR_SERVER_IP` with your actual server IP address

### Step 3: Configure Your Bot

The setup wizard has several fields:

#### 1. Private Key (Required)

**Paste your wallet's private key** (from [Creating Your Solana Wallet](#creating-your-solana-wallet))

- **Format:** Base58 string (looks like: `5Jz8x9N...`)
- **Security:** The bot encrypts this with AES-256 before storing
- **Never share this key with anyone**

#### 2. RPC Endpoint (Optional but Recommended)

**What it is:** The server your bot uses to connect to Solana blockchain.

**Default:** `https://api.mainnet-beta.solana.com` (free, rate-limited)

**Recommended Providers (for better performance):**

- **Helius** (Recommended): [https://helius.dev/](https://helius.dev/)
  - Free tier: 100k requests/day
  - Premium: Better reliability, priority fees
  - Format: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`

- **QuickNode**: [https://quicknode.com/](https://quicknode.com/)
  - Free trial available
  - Fast and reliable
  - Format: `https://your-endpoint.quiknode.pro/YOUR_KEY/`

- **Triton**: [https://triton.one/](https://triton.one/)
  - Format: `https://api.mainnet.rpc.triton.one/?api-key=YOUR_KEY`

**How to get an RPC key:**
1. Sign up for free account at provider
2. Create a new Solana Mainnet endpoint
3. Copy the RPC URL
4. Paste it in the setup wizard

#### 3. Dashboard Password (Optional but Recommended)

**If you're on a server accessible from the internet, set a password!**

- Choose a strong password
- You'll need this to access settings later
- Leave blank if running locally only

#### 4. Dashboard Port (Optional)

**Default:** 3888

Only change this if port 3888 is already in use.

### Step 4: Complete Setup

Click **"Complete Setup"** button.

**What happens:**
- Bot validates your private key
- Tests RPC connection
- Creates encrypted database
- Bot automatically starts mining!

You'll be redirected to the main dashboard.

---

## Running Your Bot

### Starting the Bot

**Basic Command (Most Users):**

```bash
npm start
```

**What this does:** Starts both the bot and dashboard together.

**Dashboard URL:** `http://localhost:3888` (or `http://YOUR_SERVER_IP:3888`)

### Alternative Start Commands

**Bot Only (no dashboard):**
```bash
npm run start:bot
```

**Dashboard Only:**
```bash
npm run start:dashboard
```

### Stopping the Bot

**In the terminal where bot is running:**
- Press `Ctrl + C` (Windows/Linux)
- Press `Control + C` (Mac)

**Wait for:** "Gracefully shutting down..." message

**What this does:** Cleanly stops the bot and saves state.

### Keeping Terminal Open

**Important:** The bot runs as long as the terminal window is open.

- **Don't close the terminal** while mining
- **Minimize it instead**
- For 24/7 operation, see [24/7 Server Setup](#247-server-setup-advanced)

---

## Monitoring Your Bot

### Dashboard Overview

Open the dashboard in your browser: `http://localhost:3888`

**Main Dashboard Shows:**
- Current status (mining, idle, claiming)
- Wallet balance (SOL, ORB, ORE)
- Current protocol (🟣 ORB or 🟠 ORE)
- Automation account balance
- Claimable rewards
- Recent activity

### Dashboard Pages

**Performance Page:** `/performance`
- Win rate statistics
- Average returns
- Round history
- Monte Carlo optimization results

**Transactions Page:** `/transactions`
- All deployments, claims, swaps
- Transaction signatures (click to view on Solscan)
- Amounts and timestamps

**Analytics Page:** `/analytics`
- Charts and graphs
- Profitability trends
- Balance history

**Profitability Page:** `/profitability`
- Live Expected Value (EV) calculation
- Competition analysis
- Current motherload
- Break-even analysis

**Settings Page:** `/settings`
- Configure all bot parameters
- 60+ options available
- Changes take effect immediately (no restart)

### Key Metrics to Watch

**1. Expected Value (EV)**

The bot calculates profitability before each deployment:

- **EV > 0:** Profitable - bot will mine
- **EV < 0:** Unprofitable - bot will wait

**Check:** Profitability page or logs

**2. Motherload**

The global prize pool that winners share:

- **Higher motherload:** More profitable mining
- **Default threshold:** Bot only mines when motherload ≥ 100 ORB
- **Configure:** Settings page → `MOTHERLOAD_THRESHOLD`

**3. Automation Balance**

The SOL balance in your automation account:

- **Depleting:** Normal - this is your deployment budget
- **Empty:** Bot will stop mining and claim rewards
- **Refills:** Automatically when creating new automation

**4. Win Rate**

Your success rate:

- **Expected:** ~4% (1 in 25 chance per round)
- **Variance:** Perfectly normal to be 0-10%
- **Long-term:** Should approach 4% over hundreds of rounds

### Reading the Logs

**Log Files Location:** `logs/` folder

**combined.log:** All bot activity
```bash
# View last 50 lines (Linux/Mac)
tail -n 50 logs/combined.log

# Follow live (Linux/Mac)
tail -f logs/combined.log

# View in editor (Windows)
notepad logs\combined.log
```

**error.log:** Errors only
- Check this if bot stops unexpectedly

**transactions.log:** Transaction signatures
- Use signatures to verify on [Solscan](https://solscan.io/)

**Common Log Messages:**

✅ **"Profitability check PASSED"** - Bot is deploying
❌ **"Profitability check FAILED"** - Competition too high, bot is waiting
💰 **"Auto-claim triggered"** - Bot is claiming rewards
🔄 **"Auto-swap triggered"** - Bot is swapping ORB to SOL
📊 **"Expected Value: 0.XXX SOL"** - Profitability calculation

---

## Updating Your Bot

The developers regularly release updates with bug fixes and new features.

### Step 1: Stop the Bot

Press `Ctrl + C` in the terminal where bot is running.

### Step 2: Pull Latest Changes

```bash
cd orb_miner
git pull
```

**What this does:** Downloads the latest code from GitHub.

**Common Output:**
```
Updating 1234abc..5678def
Fast-forward
 src/commands/smartBot.ts | 10 +++++-----
 1 file changed, 5 insertions(+), 5 deletions(-)
```

### Step 3: Update Dependencies

```bash
npm install
cd dashboard && npm install && cd ..
```

**What this does:** Updates all libraries to latest versions.

### Step 4: Rebuild

```bash
npm run build
npm run build:dashboard
```

**What this does:** Recompiles TypeScript with new code.

**Check for errors!** If you see red error messages, report them in GitHub issues.

### Step 5: Restart Bot

```bash
npm start
```

**Your configuration is preserved!** Settings are stored in the database, not in code files.

### Checking for Updates

**Manual Check:**

Visit the GitHub repository: [https://github.com/CryptoGnome/orb_miner](https://github.com/CryptoGnome/orb_miner)

Look for the latest commit date on the main page.

**Command Line Check:**

```bash
git fetch
git status
```

If you see "Your branch is behind", there's an update available.

---

## 24/7 Server Setup (Advanced)

If you want your bot to run continuously (24/7), you need a process manager. **PM2** is the recommended tool.

### Prerequisites

- Linux server (Ubuntu, Debian, etc.)
- SSH access to your server
- Bot already installed and configured

### Why Use PM2?

- **Auto-restart:** If bot crashes, PM2 restarts it automatically
- **Auto-start on reboot:** Bot starts when server reboots
- **Log management:** Easy access to logs
- **Process monitoring:** View CPU/memory usage

### Step 1: Configure Bot First

**IMPORTANT:** You must configure the bot via dashboard BEFORE using PM2.

```bash
# Start dashboard
npm run start:dashboard
```

Visit `http://YOUR_SERVER_IP:3888/setup` and complete setup wizard.

Then stop the dashboard (`Ctrl + C`).

### Step 2: Install PM2 Globally

```bash
npm install -g pm2
```

**What this does:** Installs PM2 system-wide.

### Step 3: Start Bot with PM2

```bash
# Navigate to bot directory
cd ~/orb_miner

# Start bot
pm2 start npm --name "orb-bot" -- run start:bot

# Start dashboard
pm2 start npm --name "orb-dashboard" -- run start:dashboard
```

**What this does:** Runs bot and dashboard as background processes.

### Step 4: Save PM2 Configuration

```bash
pm2 save
```

**What this does:** Saves current process list.

### Step 5: Enable Auto-Start on Reboot

```bash
pm2 startup
```

**Follow the instructions displayed.** It will show a command like:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-user --hp /home/your-user
```

**Copy and run that command.**

### Step 6: Verify Everything Works

```bash
pm2 list
```

You should see:

```
┌─────┬──────────────────┬─────────┬─────────┐
│ id  │ name             │ status  │ restart │
├─────┼──────────────────┼─────────┼─────────┤
│ 0   │ orb-bot          │ online  │ 0       │
│ 1   │ orb-dashboard    │ online  │ 0       │
└─────┴──────────────────┴─────────┴─────────┘
```

### PM2 Management Commands

**View Status:**
```bash
pm2 list
```

**View Logs:**
```bash
pm2 logs orb-bot           # Bot logs
pm2 logs orb-dashboard     # Dashboard logs
pm2 logs --lines 100       # Last 100 lines from all processes
```

**Restart Processes:**
```bash
pm2 restart orb-bot orb-dashboard
```

**IMPORTANT:** Always specify process names, not "all", to avoid affecting other PM2 processes.

**Stop Processes:**
```bash
pm2 stop orb-bot orb-dashboard
```

**Delete Processes:**
```bash
pm2 delete orb-bot orb-dashboard
```

**Monitor Resources:**
```bash
pm2 monit
```

Shows real-time CPU/memory usage. Press `Ctrl + C` to exit.

### Updating Bot with PM2

When you need to update:

```bash
cd ~/orb_miner
git pull
npm install && cd dashboard && npm install && cd ..
npm run build && npm run build:dashboard
pm2 restart orb-bot orb-dashboard
```

**Check logs after restart:**
```bash
pm2 logs orb-bot --lines 50
```

### Troubleshooting PM2

**Process keeps restarting:**
```bash
pm2 logs orb-bot --err
```
Check for errors in logs.

**Process not starting:**
1. Stop PM2: `pm2 stop all`
2. Test manually: `npm run start:bot`
3. Fix any errors shown
4. Start with PM2 again

**Reset PM2 completely:**
```bash
pm2 delete all
pm2 kill
pm2 resurrect
```

---

## Troubleshooting

### Installation Issues

#### "npm not found" or "node not found"

**Problem:** Node.js not installed or not in PATH.

**Solution:**
1. Verify installation: `node --version`
2. Restart terminal after installing Node.js
3. On Windows, ensure installation added to PATH

#### "git not found"

**Problem:** Git not installed or not in PATH.

**Solution:**
1. Install Git from [git-scm.com](https://git-scm.com/)
2. Restart terminal
3. Verify: `git --version`

#### sqlite3 Build Errors (Windows)

**Problem:** Missing Visual Studio Build Tools.

**Solution:**
1. Install Visual Studio Build Tools (see [Prerequisites](#3-visual-studio-build-tools-windows-only))
2. Or install via npm: `npm install --global windows-build-tools`
3. Restart terminal
4. Run `npm install` again

#### "Permission Denied" (Linux/Mac)

**Problem:** Insufficient permissions.

**Solution:**
```bash
sudo chown -R $USER:$USER ~/orb_miner
```

**DO NOT run npm commands with sudo** - this causes more problems.

### Configuration Issues

#### "Invalid Private Key"

**Problem:** Private key format incorrect.

**Solution:**
1. Key must be Base58 format (from Phantom/Solflare)
2. Should be 87-88 characters long
3. Don't include brackets or quotes
4. Export key again from wallet

#### "Cannot connect to RPC"

**Problem:** RPC endpoint down or incorrect.

**Solution:**
1. Test endpoint: Visit RPC URL in browser (should show JSON response)
2. Check for typos in RPC URL
3. Verify API key is valid
4. Try default: `https://api.mainnet-beta.solana.com`

#### "Dashboard not loading"

**Problem:** Port 3888 already in use or dashboard not started.

**Solution:**
1. Check if bot is running: `npm start`
2. Try different port in settings
3. Check firewall isn't blocking port 3888
4. On server: `sudo ufw allow 3888/tcp`

### Runtime Issues

#### "Bot not deploying"

**Problem:** Profitability check failing or motherload too low.

**Solution:**
1. Check EV: `npx ts-node tests/test-live-profitability.ts`
2. If EV < 0: Competition is too high, bot is protecting your SOL
3. Check motherload: Dashboard → Profitability page
4. Lower threshold: Settings → `MOTHERLOAD_THRESHOLD`

#### "Insufficient funds"

**Problem:** Not enough SOL in wallet or automation account.

**Solution:**
1. Check balance: `npx ts-node tests/test-query.ts`
2. Fund wallet with more SOL
3. Wait for bot to create new automation account
4. Lower budget: Settings → `INITIAL_AUTOMATION_BUDGET_PCT`

#### "Transaction failed"

**Problem:** Network issues or invalid transaction.

**Solution:**
1. Check logs: `logs/error.log`
2. View transaction on [Solscan](https://solscan.io/) (signature in logs)
3. Common causes:
   - Network congestion: Wait and retry
   - Insufficient SOL for fees: Add more SOL
   - RPC rate limit: Upgrade RPC provider

#### "Settings not saving"

**Problem:** Database file permissions or dashboard not running.

**Solution:**
1. Ensure dashboard is running
2. Check file permissions: `data/orb_mining.db` must be writable
3. Linux: `chmod 644 data/orb_mining.db`
4. Check browser console for errors (F12)

#### "Bot stopped unexpectedly"

**Problem:** Error or loss of connection.

**Solution:**
1. Check error log: `logs/error.log`
2. Verify RPC endpoint is working
3. Check wallet still has SOL
4. Restart bot: `npm start`
5. For 24/7 operation: Use PM2 (see [24/7 Setup](#247-server-setup-advanced))

### Database Issues

#### "Database locked"

**Problem:** Multiple bot instances running or improper shutdown.

**Solution:**
1. Stop all bot processes
2. Ensure only one instance runs at a time
3. Restart bot

#### "Database corrupted"

**Problem:** File corruption (rare).

**Solution:**
1. Stop bot
2. Backup database: `cp data/orb_mining.db data/orb_mining.db.backup`
3. Try SQLite recovery:
```bash
sqlite3 data/orb_mining.db ".recover" | sqlite3 data/orb_mining_recovered.db
mv data/orb_mining_recovered.db data/orb_mining.db
```
4. Worst case: Delete database (you'll lose PnL history, must reconfigure)

### Network Issues

#### "RPC rate limit exceeded"

**Problem:** Too many requests to free RPC endpoint.

**Solution:**
1. Upgrade to paid RPC provider (Helius, QuickNode)
2. Increase delays: Settings → `DELAY_BETWEEN_DEPLOYMENTS`
3. Use multiple RPC endpoints (load balancing - advanced)

#### "Timeout errors"

**Problem:** Network latency or slow RPC.

**Solution:**
1. Switch to faster RPC provider
2. Check your internet connection
3. Increase timeout: Settings → `RPC_TIMEOUT`

### Getting Help

**GitHub Issues:**
[https://github.com/CryptoGnome/orb_miner/issues](https://github.com/CryptoGnome/orb_miner/issues)

**Before posting:**
1. Check existing issues for similar problems
2. Include error messages from logs
3. Specify your OS and Node.js version
4. Describe steps to reproduce the issue

**Discord/Telegram:**
Join the community (links in README.md)

**Logs to Include:**
- Last 50 lines of `logs/error.log`
- Relevant portion of `logs/combined.log`
- Transaction signatures from `logs/transactions.log`

---

## FAQ

### General Questions

**Q: How much can I earn?**

A: Earnings depend on:
- Motherload size (prize pool)
- Competition level (other miners)
- ORB token price
- Your deployment amounts
- Luck (lottery-based)

Expected ROI varies from +50% to +170% depending on motherload tier. See Monte Carlo results in dashboard.

**Q: Is this safe?**

A: The bot is open-source - you can review all code. However:
- Always use a dedicated wallet (not your main wallet)
- Start small (1-2 SOL) to test
- Cryptocurrency mining involves financial risk
- The developers take a 0.5% fee per deployment

**Q: Do I need to keep my computer on 24/7?**

A: For casual mining: No, run when convenient.

For optimal results: Yes, use a server with PM2 (see [24/7 Setup](#247-server-setup-advanced)).

**Q: What's the difference between ORB and ORE?**

A: Both are lottery-style mining protocols with identical mechanics:
- **ORE:** Original protocol
- **ORB:** Fork of ORE

Switch between them in Settings. The bot handles both automatically.

**Q: How does the bot decide when to mine?**

A: The bot calculates Expected Value (EV) using:
- Real-time competition data from blockchain
- Current ORB price from Jupiter DEX
- Motherload amount
- Your deployment size

**Only mines when EV > 0** (profitable).

### Technical Questions

**Q: What's an automation account?**

A: A program-derived account (PDA) that:
- Holds your mining budget (SOL)
- Deploys automatically each round
- Can be closed to reclaim remaining SOL

Think of it as a "mining wallet" the bot controls.

**Q: Why does the bot keep creating new automation accounts?**

A: Dynamic scaling - when motherload changes significantly (±40-50%), the bot:
1. Closes old automation (reclaims SOL)
2. Creates new automation with optimal bet sizing for new motherload
3. This maximizes profitability

**Q: What's Monte Carlo optimization?**

A: The bot simulates 10,000 mining rounds for each motherload tier to determine:
- Optimal bet size
- Expected ROI
- Risk-adjusted deployment amounts

Results in `performance` page.

**Q: Can I run multiple bots?**

A: Yes, but:
- Each needs separate wallet and directory
- Don't run multiple bots with same wallet (database conflicts)
- Use different dashboard ports

**Q: How is my private key stored?**

A: Your private key is:
- Encrypted with AES-256-GCM
- Stored in `data/orb_mining.db`
- Encryption key unique per installation
- Never transmitted anywhere (bot runs locally)

**Protect database file!** Set file permissions: `chmod 600 data/orb_mining.db` (Linux)

**Q: What happens if I lose the database file?**

A: You'll need to:
- Reconfigure bot (private key, settings)
- Lose PnL history
- Lose round statistics

**Backup regularly!** Copy `data/orb_mining.db` to safe location.

### Mining Strategy Questions

**Q: When should I claim rewards?**

A: Bot auto-claims when:
- SOL rewards ≥ 0.1 SOL (default)
- ORB rewards ≥ 1.0 ORB (default)

Adjust thresholds in Settings:
- `AUTO_CLAIM_SOL_THRESHOLD`
- `AUTO_CLAIM_ORB_THRESHOLD`

**Q: Should I enable auto-swap?**

A: Depends on strategy:

**Enable (default):**
- Compounds SOL for more mining
- Avoids ORB price volatility
- Maximizes long-term mining capacity

**Disable:**
- If you want to hold ORB tokens
- If you think ORB price will increase
- Set `AUTO_SWAP_ENABLED` to false in Settings

**Q: What's the best motherload threshold?**

A: Default is 100 ORB (good balance).

**Lower (50-75):** Mines more often, lower profitability per round
**Higher (150-200):** Mines less often, higher profitability when it does

Experiment and check EV on Profitability page.

**Q: Why did my bot stop mining?**

A: Common reasons:
1. **EV < 0:** Too much competition, bot is protecting your funds
2. **Motherload too low:** Below threshold
3. **Automation depleted:** Creating new automation or waiting for claims
4. **Error:** Check logs

**This is normal behavior** - the bot is conservative by design.

**Q: How do I maximize profits?**

A: Tips:
1. Use paid RPC (faster deployments)
2. Set `PRIORITY_FEE_LEVEL` to medium/high
3. Monitor profitability page - mine when EV is highest
4. Keep 10+ SOL in wallet for sustained operation
5. Enable auto-swap to compound earnings

### Troubleshooting Questions

**Q: Dashboard shows "Connection failed"**

A: Bot isn't running or database locked.

**Solution:** Start bot with `npm start`.

**Q: "Claim failed" errors**

A: Usually means no rewards to claim (already claimed or haven't won yet).

**Solution:** Check claimable amounts: `npx ts-node tests/test-query.ts`

**Q: High priority fees eating profits**

A: Adjust fee level:

**Solution:** Settings → `PRIORITY_FEE_LEVEL` → "low" or "medium"

**Q: Bot wins rounds but PnL shows negative**

A: Normal due to:
- Variance (lottery game)
- Fees (dev fee, transaction fees)
- Need more rounds to see true profitability
- Check "in-flight deployments" - rewards lag 1-2 rounds

**Give it 50+ rounds** for meaningful statistics.

---

## Next Steps

Congratulations! Your bot is now set up and running.

**Recommended Actions:**

1. **Monitor for First 24 Hours:**
   - Watch logs: `tail -f logs/combined.log` (Linux/Mac)
   - Check dashboard every few hours
   - Verify deployments on [Solscan](https://solscan.io/)

2. **Tune Settings:**
   - Experiment with `MOTHERLOAD_THRESHOLD`
   - Adjust auto-claim thresholds
   - Test different priority fee levels

3. **Set Up Alerts (Optional):**
   - Monitor wallet balance
   - Set up Discord/Telegram notifications (see advanced guides)

4. **Join the Community:**
   - GitHub: Star the repository, watch for updates
   - Discord/Telegram: Get support, share strategies

5. **Backup Your Database:**
   - Regularly copy `data/orb_mining.db`
   - Store backup securely

**Happy Mining!** 🚀

---

*Last Updated: 2025-01-23*
*Bot Version: 1.0.0*
*Guide Version: 1.0.0*

**Disclaimer:** Cryptocurrency mining involves financial risk. Only invest what you can afford to lose. The bot developers provide the software as-is with no guarantees of profitability. Past performance does not indicate future results. Always do your own research (DYOR).