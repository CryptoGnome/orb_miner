#!/bin/bash
# Update script for orb_miner
# Run this after 'git pull' to update dependencies and restart services

echo "🔄 Updating ORB Miner..."
echo ""

# Install/update root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install/update dashboard dependencies
echo "📦 Installing dashboard dependencies..."
cd dashboard
npm install

# Clear Next.js cache
echo "🧹 Clearing Next.js cache..."
rm -rf .next

cd ..

# Rebuild TypeScript
echo "🔨 Building bot..."
npm run build

# Rebuild dashboard
echo "🔨 Building dashboard..."
npm run build:dashboard

# Check if PM2 is running the processes
if command -v pm2 &> /dev/null; then
    echo "🔄 Checking PM2 processes..."

    # Restart bot if it's running
    if pm2 list | grep -q "orb-bot"; then
        echo "🔄 Restarting orb-bot..."
        pm2 restart orb-bot
    fi

    # Restart dashboard if it's running
    if pm2 list | grep -q "orb-dashboard"; then
        echo "🔄 Restarting orb-dashboard..."
        pm2 restart orb-dashboard
    fi
fi

echo ""
echo "✅ Update complete!"
echo ""
echo "If you're not using PM2, restart your processes manually:"
echo "  - Bot: npm start"
echo "  - Dashboard: npm run start:dashboard"
