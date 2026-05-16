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
      scope: 'admin.weekly-ai-recap.runs',
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
      scope: 'admin.weekly-ai-recap.runs',
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
    scope: 'admin.weekly-ai-recap.runs',
  });

  return supabase;
}

export async function GET(request: Request) {
  try {
    const supabase = await getAdminClient(request);
    if (!supabase) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('ai_recap_runs')
      .select('id, edition_key, trigger_type, mode, attempt, status, started_at, finished_at, error_message, failure_reason, metrics_json', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      data: data ?? [],
      count: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Get AI recap runs error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

