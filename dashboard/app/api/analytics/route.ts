import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getBalanceHistory, getDailySummaries } from '@bot/utils/database';
import sqlite3 from 'sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Get price history from database
async function getPriceHistory(limit: number = 100): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(process.cwd(), '..', 'data', 'orb_mining.db');
    const db = new sqlite3.Database(dbPath);

    db.all(
      `SELECT * FROM prices ORDER BY timestamp DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve((rows as any[]).reverse());
        }
      }
    );
  });
}

export async function GET() {
  try {
    await ensureBotInitialized();

    // Fetch analytics data in parallel
    const [balanceHistory, dailySummaries, priceHistory] = await Promise.all([
      getBalanceHistory(100),
      getDailySummaries(30),
      getPriceHistory(100),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      balanceHistory: balanceHistory.reverse(), // Most recent last for charts
      dailySummaries,
      priceHistory,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
