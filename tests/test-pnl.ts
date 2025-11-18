import { pnlCommand } from '../src/commands/pnl';

/**
 * Test script to view PnL (Profit and Loss) report
 *
 * Usage:
 *   npx ts-node tests/test-pnl.ts
 */

async function main() {
  await pnlCommand();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
