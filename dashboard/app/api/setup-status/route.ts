import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getQuery } from '@bot/utils/database';
import { isMaintenanceMode, MAINTENANCE_RESPONSE } from '@/lib/maintenance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check for maintenance mode - don't access database if in maintenance
    if (isMaintenanceMode()) {
      return NextResponse.json(MAINTENANCE_RESPONSE, { status: 503 });
    }

    await ensureBotInitialized();

    // Check if PRIVATE_KEY is set
    const setting = await getQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['PRIVATE_KEY']
    );

    const isSetupNeeded = !setting || !setting.value || setting.value === '';

    return NextResponse.json({
      setupNeeded: isSetupNeeded,
      message: isSetupNeeded
        ? 'Setup required - PRIVATE_KEY not configured'
        : 'Setup complete',
    });
  } catch (error) {
    console.error('Failed to check setup status:', error);
    return NextResponse.json(
      { error: 'Failed to check setup status', setupNeeded: true },
      { status: 500 }
    );
  }
}
