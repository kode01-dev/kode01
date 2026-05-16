import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';
import {
  getPrelaunchAuthAccessState,
  PRELAUNCH_AUTH_COOKIE_MAX_AGE_SECONDS,
  PRELAUNCH_AUTH_COOKIE_NAME,
  verifyLockscreenPassword,
} from '@/features/site-lockscreen/lib/lockscreen-server';

const accessSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * GET /api/prelaunch/access
 * Returns current prelaunch login/signup access state.
 * Contract: { enabled: boolean, locked: boolean, unlocked: boolean }
 */
export async function GET() {
  const state = await getPrelaunchAuthAccessState();
  return NextResponse.json(state);
}

/**
 * POST /api/prelaunch/access
 * Validates password and sets cookie to unlock login/signup forms.
 */
export async function POST(request: Request) {
  const rateLimited = await enforceRouteRateLimit({
    request,
    action: 'PRELAUNCH_ACCESS',
  });
  if (rateLimited) {
    return rateLimited;
  }

  const state = await getPrelaunchAuthAccessState();
  if (!state.enabled) {
    return NextResponse.json({ success: true });
  }
  if (state.unlocked) {
    return NextResponse.json({ success: true });
  }

  const body = await request.json().catch(() => null);
  const parsed = accessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request: password is required' },
      { status: 400 },
    );
  }

  const passwordValid = await verifyLockscreenPassword(parsed.data.password);
  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PRELAUNCH_AUTH_COOKIE_NAME, 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PRELAUNCH_AUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
