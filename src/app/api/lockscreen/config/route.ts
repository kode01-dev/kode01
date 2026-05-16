import { NextResponse } from 'next/server';
import { getLockscreenConfig } from '@/features/site-lockscreen/lib/lockscreen-server';

/**
 * GET /api/lockscreen/config
 * Returns public lockscreen configuration (no password hash)
 * No authentication required
 */
export async function GET() {
  try {
    const config = await getLockscreenConfig();

    if (!config) {
      return NextResponse.json(
        { error: 'Lockscreen configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error fetching lockscreen config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lockscreen configuration' },
      { status: 500 }
    );
  }
}
