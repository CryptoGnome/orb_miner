# ORB Mining Dashboard

A modern, real-time dashboard for monitoring your ORB mining bot with a beautiful dark neon blue theme.

## Features

- **Real-time Monitoring**: Live updates of wallet balances, bot status, and current round information
- **Profitability Tracking**: Detailed P&L analysis with income/expense breakdown
- **Performance Analytics**: Mining round history and statistics
- **Transaction History**: Complete transaction log with filtering
- **Visual Analytics**: Interactive charts for balance history, daily activity, and price trends
- **Modern UI**: Dark theme with neon blue accents and glassmorphism effects

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **TanStack Query v5** - Data fetching and caching
- **shadcn/ui** - Beautiful UI components
- **Recharts** - Data visualization
- **Tailwind CSS** - Utility-first styling

## Getting Started

### Prerequisites

- Node.js 16+ installed
- ORB mining bot running (in the parent directory)
- SQLite database with mining data

### Installation

The dashboard is already installed! Dependencies were set up during the build process.

### Running the Dashboard

```bash
# From the dashboard directory
cd dashboard
npm run dev
```

The dashboard will be available at [http://localhost:3000](http://localhost:3000) (or 3001 if 3000 is in use).

### Building for Production

```bash
# Build the dashboard
npm run build

# Start production server
npm start
```

## Dashboard Pages

### Overview (`/`)
- Real-time wallet balances (SOL, ORB, Automation)
- Current ORB price
- Claimable rewards from mining and staking
- Current round information and motherload

### Profitability (`/profitability`)
- Net P&L and ROI
- Income breakdown (SOL claimed, ORB swapped, current holdings)
- Expense breakdown (deploy fees, tx fees, dev fees)
- Current balance snapshot

### Performance (`/performance`)
- Recent mining rounds history
- Round details (motherload, deployed amount, squares)
- Time-based statistics

### Transactions (`/transactions`)
- Complete transaction history
- Transaction type filtering
- Status badges and timestamps
- SOL/ORB amounts per transaction

### Analytics (`/analytics`)
- Balance history chart (SOL and ORB over time)
- Daily activity chart (rounds and deployment per day)
- ORB price history chart

## API Endpoints

The dashboard consumes the following API routes:

- `GET /api/status` - Current bot status, balances, and round info
- `GET /api/pnl` - Profit & loss summary
- `GET /api/transactions?limit=50` - Transaction history
- `GET /api/rounds?limit=20` - Round history
- `GET /api/analytics` - Balance history, daily summaries, price data

## Configuration

### TypeScript Path Aliases

The dashboard is configured to import from the bot's source code:

```typescript
import { getBalances } from '@bot/utils/wallet';
import { fetchBoard } from '@bot/utils/accounts';
import { getPnLSummary } from '@bot/utils/database';
```

### Data Refresh Intervals

- Status data: Every 10 seconds
- P&L data: Every 30 seconds
- Transactions/Rounds: Every 30 seconds
- Analytics: Every 60 seconds

## Theme Customization

The dashboard uses a dark neon blue theme. Colors are defined in `app/globals.css`:

- Primary: `oklch(0.70 0.20 235)` - Neon blue
- Background: `oklch(0.11 0.01 240)` - Dark slate
- Accent: `oklch(0.25 0.03 235)` - Blue accent

Custom utility classes:
- `.neon-glow` - Box shadow glow effect
- `.neon-text` - Text shadow glow effect
- `.neon-border` - Border with glow effect
- `.glass-card` - Glassmorphism card effect
- `.animate-pulse-glow` - Pulsing glow animation

## Development Tips

### Adding New Components

```bash
# Add shadcn/ui components
npx shadcn@latest add [component-name]
```

### Debugging API Routes

API routes are located in `app/api/*/route.ts`. They import directly from the bot's utilities:

```typescript
import { getImprovedPnLSummary } from '@bot/utils/database';
```

### Hot Reload

Next.js Turbopack provides fast hot reload. Changes to components and pages will reflect immediately.

## Troubleshooting

### Port Already in Use

If port 3000 is occupied, Next.js will automatically use port 3001. Check the terminal output for the actual URL.

### Database Connection Issues

Ensure the SQLite database exists at `../data/orb_mining.db` (relative to dashboard directory).

### Missing Solana Dependencies

The dashboard imports Solana utilities from the bot. Ensure all bot dependencies are installed:

```bash
# From the root directory
npm install
```

## Future Enhancements

- Real-time WebSocket updates
- Bot control panel (start/stop/restart)
- Alert notifications for wins and errors
- Export data to CSV/JSON
- Mobile responsive improvements
- Settings page for configuration
- Live log viewer

## License

Part of the ORB Mining Bot project.
