import { NextResponse } from 'next/server';
import { getImprovedPnLSummary } from '@bot/utils/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const pnlSummary = await getImprovedPnLSummary();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...pnlSummary,
    });
  } catch (error) {
    console.error('Error fetching PnL:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PnL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
