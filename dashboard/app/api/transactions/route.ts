import { NextRequest, NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getRecentTransactions } from '@bot/utils/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await ensureBotInitialized();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const type = searchParams.get('type') || undefined;

    const transactions = await getRecentTransactions(limit);

    // Filter by type if specified
    const filtered = type
      ? transactions.filter((tx) => tx.type === type)
      : transactions;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      count: filtered.length,
      transactions: filtered,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
