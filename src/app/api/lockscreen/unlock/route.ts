import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifyLockscreenPassword } from '@/features/site-lockscreen/lib/lockscreen-server';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';

const unlockSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/lockscreen/unlock
 * Validates password and sets unlock cookie
 * Rate-limited: 5 attempts per 15 minutes per IP
 */
export async function POST(request: Request) {
  try {
    // Enforce rate limiting
    const rateLimited = await enforceRouteRateLimit({
      request,
      action: 'LOCKSCREEN_UNLOCK',
    });
    if (rateLimited) {
      return rateLimited;
    }

    // Parse and validate request body
    const body = await request.json().catch(() => null);
    const parsed = unlockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: password is required' },
        { status: 400 }
      );
    }

    // Verify password
    const isValid = await verifyLockscreenPassword(parsed.data.password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Set unlock cookie (7 days)
    const cookieStore = await cookies();
    cookieStore.set('lockscreen_unlocked', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlocking lockscreen:', error);
    return NextResponse.json(
      { error: 'Failed to unlock' },
      { status: 500 }
    );
  }
}
