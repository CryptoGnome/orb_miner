@echo off
REM Update script for orb_miner (Windows)
REM Run this after 'git pull' to update dependencies and restart services

echo 🔄 Updating ORB Miner...
echo.

REM Install/update root dependencies
echo 📦 Installing root dependencies...
call npm install

REM Install/update dashboard dependencies
echo 📦 Installing dashboard dependencies...
cd dashboard
call npm install

REM Clear Next.js cache
echo 🧹 Clearing Next.js cache...
if exist .next rd /s /q .next

cd ..

REM Rebuild TypeScript
echo 🔨 Building TypeScript...
call npm run build

REM Check if PM2 is available
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    echo 🔄 Checking PM2 processes...

    REM Restart bot if it's running
    pm2 list | findstr /C:"orb-miner" >nul 2>nul
    if %errorlevel% equ 0 (
        echo 🔄 Restarting orb-miner...
        pm2 restart orb-miner
    )

    REM Restart dashboard if it's running
    pm2 list | findstr /C:"orb-dashboard" >nul 2>nul
    if %errorlevel% equ 0 (
        echo 🔄 Restarting orb-dashboard...
        pm2 restart orb-dashboard
    )
)

echo.
echo ✅ Update complete!
echo.
echo If you're not using PM2, restart your processes manually:
echo   - Bot: npm run bot
echo   - Dashboard: cd dashboard ^&^& npm run dev
