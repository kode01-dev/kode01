import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';

async function getAdminClient(request?: Request) {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) return null;
  return { supabase, userId: user.id };
}

export async function GET() {
  try {
    const adminClient = await getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase } = adminClient;

    const { data, error } = await supabase
      .from('ai_recap_day_themes')
      .select('*')
      .order('day_index', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient(req);
    if (!adminClient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase, userId } = adminClient;

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload.day_index !== 'number') {
      return NextResponse.json({ error: 'day_index is required' }, { status: 400 });
    }

    const dayIndex = payload.day_index;
    if (dayIndex < 1 || dayIndex > 5) {
      return NextResponse.json({ error: 'day_index must be 1-5' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (typeof payload.theme_name_fr === 'string') updateData.theme_name_fr = payload.theme_name_fr.trim();
    if (typeof payload.theme_name_en === 'string') updateData.theme_name_en = payload.theme_name_en.trim();
    if (typeof payload.theme_description_fr === 'string') updateData.theme_description_fr = payload.theme_description_fr.trim();
    if (typeof payload.theme_description_en === 'string') updateData.theme_description_en = payload.theme_description_en.trim();
    if (Array.isArray(payload.source_ids)) updateData.source_ids = payload.source_ids;
    if (typeof payload.is_active === 'boolean') updateData.is_active = payload.is_active;
    if (typeof payload.skip_if_quiet === 'boolean') updateData.skip_if_quiet = payload.skip_if_quiet;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('ai_recap_day_themes')
      .update(updateData)
      .eq('day_index', dayIndex)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'ai_recap.day_theme.update.success',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { day_index: dayIndex, ...updateData },
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAuditEvent({
      eventType: 'ai_recap.day_theme.update.failed',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
