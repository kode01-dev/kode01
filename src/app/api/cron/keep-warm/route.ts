import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleKeepWarm(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  await supabase.from('profiles').select('id').limit(1).maybeSingle();

  return NextResponse.json({ ok: true, ts: Date.now() });
}

export async function GET(req: Request) {
  return handleKeepWarm(req);
}
