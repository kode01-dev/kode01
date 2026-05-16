import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAdminApiAuthDecision } from '@/app/api/admin/_audit';
import { isAdminRole } from '@/lib/auth/roles';

async function getAdminClient(request?: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAdminApiAuthDecision({
      granted: false,
      request,
      scope: 'admin.security.bot-stats',
      reason: 'missing_user',
    });
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    await logAdminApiAuthDecision({
      granted: false,
      userId: user.id,
      request,
      scope: 'admin.security.bot-stats',
      reason: 'role_not_admin',
      metadata: {
        role: profile?.role ?? null,
      },
    });
    return null;
  }

  await logAdminApiAuthDecision({
    granted: true,
    userId: user.id,
    request,
    scope: 'admin.security.bot-stats',
  });

  return supabase;
}

async function countBotActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters?: {
    source?: string;
    reason?: string;
    blocked?: boolean;
    sinceIso?: string;
  },
): Promise<number> {
  let query = supabase.from('bot_activity').select('id', { count: 'exact', head: true });

  if (typeof filters?.source === 'string') query = query.eq('source', filters.source);
  if (typeof filters?.reason === 'string') query = query.eq('reason', filters.reason);
  if (typeof filters?.blocked === 'boolean') query = query.eq('blocked', filters.blocked);
  if (typeof filters?.sinceIso === 'string') query = query.gte('detected_at', filters.sinceIso);

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function getSinceIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export async function GET(request: Request) {
  try {
    const supabase = await getAdminClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const since24h = getSinceIso(24);
    const since7d = getSinceIso(24 * 7);

    const [
      detectedTotal,
      detected24h,
      detected7d,
      honeypotTotal,
      honeypot24h,
      honeypot7d,
      blockedTotal,
      blocked24h,
      blocked7d,
    ] = await Promise.all([
      countBotActivity(supabase),
      countBotActivity(supabase, { sinceIso: since24h }),
      countBotActivity(supabase, { sinceIso: since7d }),
      countBotActivity(supabase, { source: 'honeypot', reason: 'honeypot_trip' }),
      countBotActivity(supabase, { source: 'honeypot', reason: 'honeypot_trip', sinceIso: since24h }),
      countBotActivity(supabase, { source: 'honeypot', reason: 'honeypot_trip', sinceIso: since7d }),
      countBotActivity(supabase, { blocked: true }),
      countBotActivity(supabase, { blocked: true, sinceIso: since24h }),
      countBotActivity(supabase, { blocked: true, sinceIso: since7d }),
    ]);

    return NextResponse.json({
      counters: {
        botsDetected: {
          total: detectedTotal,
          last24h: detected24h,
          last7d: detected7d,
        },
        botsCaughtByHoneypot: {
          total: honeypotTotal,
          last24h: honeypot24h,
          last7d: honeypot7d,
        },
        botsBlocked: {
          total: blockedTotal,
          last24h: blocked24h,
          last7d: blocked7d,
        },
      },
    });
  } catch (error) {
    console.error('Get bot stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

