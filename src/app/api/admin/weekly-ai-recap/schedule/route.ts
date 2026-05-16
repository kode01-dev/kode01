import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';
import type { Json } from '@/types/database.types';
import {
  AI_RECAP_SCHEDULE_SLOT_KEYS,
  parseAiRecapScheduleSlotPayload,
  scheduleSlotUpdateFields,
} from '@/lib/ai-recap/schedule';

const scheduleSelect =
  'id, is_enabled, timezone, slot_a_day, slot_a_hour, slot_a_minute, slot_b_day, slot_b_hour, slot_b_minute, slot_c_day, slot_c_hour, slot_c_minute, slot_d_day, slot_d_hour, slot_d_minute, slot_e_day, slot_e_hour, slot_e_minute, created_at, updated_at';

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

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

async function ensureScheduleRow(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: existing, error: selectError } = await supabase
    .from('ai_recap_schedule_settings')
    .select(scheduleSelect)
    .eq('id', true)
    .maybeSingle();

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from('ai_recap_schedule_settings')
    .insert({ id: true })
    .select(scheduleSelect)
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Unable to create schedule row');
  }

  return inserted;
}

export async function GET() {
  try {
    const adminClient = await getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase } = adminClient;

    const data = await ensureScheduleRow(supabase);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Get AI recap schedule error:', error);
    return NextResponse.json({ error: message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient(req);
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.schedule.update.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase, userId } = adminClient;

    await ensureScheduleRow(supabase);
    const payload = await req.json().catch(() => null);
    const updateData: Record<string, unknown> = {};

    if (typeof payload?.is_enabled === 'boolean') {
      updateData.is_enabled = payload.is_enabled;
    }

    if (typeof payload?.timezone === 'string') {
      const timezone = payload.timezone.trim();
      if (!timezone) {
        await logAuditEvent({
          eventType: 'ai_recap.schedule.update.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { reason: 'timezone_required' },
        });
        return NextResponse.json({ error: 'timezone is required' }, { status: 400 });
      }
      if (!isValidTimeZone(timezone)) {
        await logAuditEvent({
          eventType: 'ai_recap.schedule.update.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { reason: 'invalid_timezone', timezone },
        });
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
      updateData.timezone = timezone;
    }

    for (const key of AI_RECAP_SCHEDULE_SLOT_KEYS) {
      const parsedSlot = parseAiRecapScheduleSlotPayload(payload, key);
      if (!parsedSlot) continue;

      if ('error' in parsedSlot) {
        await logAuditEvent({
          eventType: 'ai_recap.schedule.update.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { reason: parsedSlot.error, slot: key },
        });
        return NextResponse.json(
          { error: parsedSlot.error, code: 'INVALID_SCHEDULE_SLOT' },
          { status: 400 },
        );
      }

      Object.assign(updateData, scheduleSlotUpdateFields(parsedSlot.slot));
    }

    if (Object.keys(updateData).length === 0) {
      await logAuditEvent({
        eventType: 'ai_recap.schedule.update.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'empty_update' },
      });
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_recap_schedule_settings')
      .update(updateData)
      .eq('id', true)
      .select(scheduleSelect)
      .single();

    if (error) {
      await logAuditEvent({
        eventType: 'ai_recap.schedule.update.failed.db_error',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'ai_recap.schedule.update.success',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: updateData as Json,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Update AI recap schedule error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.schedule.update.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: message },
    });
    return NextResponse.json({ error: message || 'Internal Server Error' }, { status: 500 });
  }
}
