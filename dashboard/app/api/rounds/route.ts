import { NextRequest, NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getRecentRounds } from '@bot/utils/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await ensureBotInitialized();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const rounds = await getRecentRounds(limit);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      count: rounds.length,
      rounds,
    });
  } catch (error) {
    console.error('Error fetching rounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rounds', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
