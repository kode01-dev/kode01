import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isLockscreenEnabled } from '@/features/site-lockscreen/lib/lockscreen-server';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/auth/roles';

/**
 * GET /api/lockscreen/status
 * Checks if user has unlocked the lockscreen
 * Returns: { locked: boolean, unlocked: boolean }
 */
export async function GET() {
  try {
    // Check if lockscreen feature is enabled
    const enabled = await isLockscreenEnabled();

    if (!enabled) {
      return NextResponse.json({
        locked: false,
        unlocked: true,
      });
    }

    // Check if user has unlock cookie
    const cookieStore = await cookies();
    const unlockCookie = cookieStore.get('lockscreen_unlocked');
    const unlocked = unlockCookie?.value === 'true';

    if (unlocked) {
      return NextResponse.json({
        locked: false,
        unlocked: true,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (isAdminRole(profile?.role)) {
        return NextResponse.json({
          locked: false,
          unlocked: true,
        });
      }
    }

    return NextResponse.json({
      locked: !unlocked,
      unlocked,
    });
  } catch (error) {
    console.error('Error checking lockscreen status:', error);
    // On error, assume not locked for safety
    return NextResponse.json({
      locked: false,
      unlocked: true,
    });
  }
}
