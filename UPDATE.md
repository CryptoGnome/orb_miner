# Update Guide

## After `git pull`

When you pull updates from the repository, run the update script to ensure everything is properly installed and configured:

```bash
npm run update
```

This will automatically:
- ✅ Install/update all root dependencies
- ✅ Install/update dashboard dependencies
- ✅ Clear Next.js cache to prevent build errors
- ✅ Rebuild TypeScript files
- ✅ Restart PM2 processes (if running)

## Manual Alternative

If you prefer to update manually or encounter issues:

### Linux/Mac:
```bash
./update.sh
```

### Windows:
```cmd
update.bat
```

## First Time Setup

If this is your first time setting up the project:
```bash
npm run setup
```

## Troubleshooting

### "Module not found" errors in dashboard
This usually means the Next.js cache wasn't cleared. Run:
```bash
cd dashboard
rm -rf .next
npm install
pm2 restart orb-dashboard  # if using PM2
```

### TypeScript build errors
Clear and rebuild:
```bash
npm run clean
npm run build
```

### PM2 processes not restarting
Manually restart them:
```bash
pm2 restart orb-miner
pm2 restart orb-dashboard
```
