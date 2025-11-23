# Dashboard UI Integration - Strategy System

This document describes the UI integration for the new strategy system, including how to use the dropdowns and manual claim button.

## Overview

The dashboard has been updated with:
1. **Strategy Dropdowns** in Settings page
2. **Conditional Fields** that show/hide based on selected strategy
3. **Manual Claim Button** on main dashboard
4. **Real-time Updates** via React Query

## Settings Page Updates

### Deployment Amount Strategy

**Location:** Settings → Automation tab

**Dropdown:** "Deployment Strategy"

**Options:**
- Auto (Motherload-Based) - Original behavior
- Manual (Fixed Amount) - User-specified amount
- Fixed Rounds - Target specific number of rounds
- Percentage of Budget - % per round

**Conditional Fields:**

When you select a strategy, only the relevant field appears:

| Selected Strategy | Visible Field | Description |
|------------------|---------------|-------------|
| Manual | Manual Amount Per Round | Exact SOL amount (e.g., 0.05) |
| Fixed Rounds | Target Rounds | Number of rounds (e.g., 200) |
| Percentage | Budget % Per Round | Percentage (e.g., 1.0) |
| Auto | *(none)* | Uses motherload tiers |

**Example:**
1. Select "Manual (Fixed Amount)" from dropdown
2. "Manual Amount Per Round" field appears
3. Enter 0.05
4. Bot will deploy exactly 0.05 SOL per round

### Claim Strategy

**Location:** Settings → Automation tab

**Dropdown:** "Claim Strategy"

**Options:**
- Auto (Threshold-Based) - Original behavior
- Manual (Dashboard Button) - User triggers claims

**Conditional Fields:**

When "Auto" is selected:
- Auto-Claim SOL Threshold
- Auto-Claim ORB Threshold
- Auto-Claim Staking Threshold

When "Manual" is selected:
- *(All threshold fields hidden)*
- Use "Claim Now" button on main dashboard

**Example:**
1. Select "Manual (Dashboard Button)"
2. Threshold fields disappear
3. Bot will never auto-claim
4. Use "Claim Now" button to claim when ready

## Main Dashboard Updates

### Claim Now Button

**Location:** Main Dashboard → Claimable Rewards Card

**Features:**
- Displays claimable amounts (SOL and ORB)
- Shows both mining and staking rewards
- One-click claim button
- Loading state during claim
- Success/error notifications

**How to Use:**

1. **View Claimable Amounts:**
   - SOL from Mining
   - ORB from Mining
   - ORB from Staking
   - Total value in SOL and USD

2. **Claim Rewards:**
   - Click "Claim Now" button
   - Button shows "Claiming..." while processing
   - Success toast notification on completion
   - Dashboard automatically refreshes

3. **Error Handling:**
   - If claim fails, error message is shown
   - Button re-enables for retry
   - Check bot logs for details

### Visual Feedback

**Button States:**
- **Normal:** Blue button with "Claim Now" text
- **Loading:** Disabled with "Claiming..." text
- **Success:** Toast notification "Claim successful!"
- **Error:** Toast notification "Claim failed"

**Auto-Refresh:**
- After claim, status data refreshes automatically
- PnL updates to reflect claimed rewards
- Balance shows new amounts

## Settings Flow Examples

### Example 1: Switch to Manual Deployment

1. Go to Settings → Automation tab
2. Find "Deployment Strategy" dropdown
3. Select "Manual (Fixed Amount)"
4. "Manual Amount Per Round" field appears
5. Enter desired amount (e.g., 0.05 SOL)
6. Settings save automatically
7. Restart bot to apply changes

### Example 2: Enable Manual Claiming

1. Go to Settings → Automation tab
2. Find "Claim Strategy" dropdown
3. Select "Manual (Dashboard Button)"
4. Threshold fields disappear
5. Settings save automatically
6. Bot stops auto-claiming
7. Use "Claim Now" button on dashboard

### Example 3: Switch to Fixed Rounds

1. Go to Settings → Automation tab
2. Find "Deployment Strategy" dropdown
3. Select "Fixed Rounds"
4. "Target Rounds" field appears
5. Enter desired rounds (e.g., 200)
6. Settings save automatically
7. Budget will be split across 200 rounds

## Technical Details

### Settings Persistence

- All settings stored in SQLite database
- Changes persist across bot restarts
- Config cache refreshed on save
- Settings take effect on next automation setup

### API Endpoints Used

**Settings:**
- `GET /api/settings` - Load all settings
- `PATCH /api/settings` - Update single setting

**Claiming:**
- `POST /api/claim` - Trigger manual claim
- `GET /api/claim` - Get claimable amounts (future)

### React Query Integration

**Automatic Refetching:**
- Status: Every 10 seconds
- PnL: Every 30 seconds
- Analytics: Every 60 seconds

**Invalidation on Claim:**
- Status query invalidated
- PnL query invalidated
- Fresh data fetched automatically

### State Management

**Local State:**
- Input values stored in React state
- Immediate UI feedback
- Debounced API calls for performance

**Server State:**
- Single source of truth
- Optimistic updates
- Automatic reconciliation

## Troubleshooting

### Strategy Not Taking Effect

**Problem:** Changed strategy but bot still using old logic

**Solution:**
1. Restart bot with `npm run start:bot`
2. Config cached at startup
3. Or wait for bot to auto-restart automation

### Conditional Fields Not Showing

**Problem:** Selected strategy but field not visible

**Solution:**
1. Refresh the page
2. Check browser console for errors
3. Verify setting saved (check Current value badge)

### Claim Button Not Working

**Problem:** Button clicks but nothing happens

**Solution:**
1. Check browser console for errors
2. Verify bot is running
3. Check claim strategy is set to "manual"
4. Check bot logs for errors

### Settings Not Saving

**Problem:** Changes revert after refresh

**Solution:**
1. Check for toast error notification
2. Verify database has write permissions
3. Check browser network tab for API errors
4. Bot may need database initialization

## Best Practices

1. **Test with Dry Run:**
   - Enable Dry Run mode before changing strategies
   - Verify calculations in logs
   - Disable Dry Run when ready

2. **Monitor First Rounds:**
   - Watch first few rounds after strategy change
   - Verify amounts match expectations
   - Check PnL for accuracy

3. **Strategy Selection:**
   - Use Auto for hands-off operation
   - Use Manual for precise control
   - Use Fixed Rounds for budgeting
   - Use Percentage for risk management

4. **Claiming:**
   - Auto strategy for convenience
   - Manual strategy for tax optimization
   - Monitor claimable amounts
   - Claim when value is significant

## Future Enhancements

Potential additions:
- Claimable amount preview before claim
- Claim history in transactions page
- Strategy performance analytics
- Custom strategy builder
- Schedule-based claiming
- Multi-wallet support

---

**Need Help?**
- Check [STRATEGY_SYSTEM.md](STRATEGY_SYSTEM.md) for backend details
- Report issues on GitHub
- Review bot logs for errors
