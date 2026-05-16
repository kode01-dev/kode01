import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';
import {
  AI_RECAP_SCHEDULE_SLOT_KEYS,
  isValidAiRecapScheduleSlot,
} from '@/lib/ai-recap/schedule';

type SmokeCheck = {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
};

const scheduleSelect =
  'is_enabled, timezone, slot_a_day, slot_a_hour, slot_a_minute, slot_b_day, slot_b_hour, slot_b_minute, slot_c_day, slot_c_hour, slot_c_minute, slot_d_day, slot_d_hour, slot_d_minute, slot_e_day, slot_e_hour, slot_e_minute';

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envCheck(name: string, aliases: string[] = []): SmokeCheck {
  const present = [name, ...aliases].some((key) => hasEnv(key));
  return {
    key: `env:${name}`,
    status: present ? 'pass' : 'fail',
    message: present ? `${name} configured` : `${name} missing`,
    details: aliases.length > 0 ? { aliases } : undefined,
  };
}

function getScheduleSlots(schedule: Record<string, unknown>) {
  return AI_RECAP_SCHEDULE_SLOT_KEYS.map((key) => ({
    key,
    day: Number(schedule[`slot_${key}_day`]),
    hour: Number(schedule[`slot_${key}_hour`]),
    minute: Number(schedule[`slot_${key}_minute`]),
  }));
}

async function getAdminClient() {
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

  return isAdminRole(profile?.role) ? { supabase, userId: user.id } : null;
}

export async function GET(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient();
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.smoke.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { supabase, userId } = adminClient;
    const checks: SmokeCheck[] = [
      envCheck('CRON_SECRET', ['CRON_SECRET_NEXT']),
      envCheck('MODAL_AGENT_API_URL'),
      envCheck('AGENT_INTERNAL_TOKEN', ['AGENT_INTERNAL_TOKEN_NEXT']),
      envCheck('SUPABASE_SERVICE_ROLE_KEY'),
      envCheck('FIRECRAWL_API_KEY'),
      envCheck('GOOGLE_GENERATIVE_AI_API_KEY', ['GOOGLE_API_KEY']),
      envCheck('ANTHROPIC_API_KEY'),
      envCheck('SENDFOX_API_TOKEN'),
      envCheck('SENDFOX_LIST_ID'),
      envCheck('SENDFOX_TEST_LIST_ID'),
    ];

    const executionMode = process.env.AGENT_EXECUTION_MODE?.trim().toLowerCase() || 'vercel';
    const recapTarget = process.env.RECAP_EXECUTION_TARGET?.trim().toLowerCase() || 'modal_native';
    const cronOwner = process.env.AGENT_CRON_OWNER_WEEKLY_RECAP?.trim().toLowerCase() || executionMode;
    const modalNativeWriter =
      executionMode === 'modal' && cronOwner === 'modal' && recapTarget === 'modal_native';
    checks.push({
      key: 'runtime:writer',
      status: modalNativeWriter ? 'pass' : 'fail',
      message:
        modalNativeWriter
          ? 'Modal native is the weekly recap writer'
          : 'AI News writer must be Modal native',
      details: { executionMode, cronOwner, recapTarget },
    });

    const [{ data: schedule }, { data: sources }, { data: dayThemes }, { data: latestRuns }, { data: latestEdition }] =
      await Promise.all([
        supabase.from('ai_recap_schedule_settings').select(scheduleSelect).eq('id', true).maybeSingle(),
        supabase.from('ai_recap_sources').select('id, name, is_active').eq('is_active', true),
        supabase.from('ai_recap_day_themes').select('day_index, source_ids, is_active').eq('is_active', true),
        supabase
          .from('ai_recap_runs')
          .select('id, edition_key, status, failure_reason, error_message, started_at, metrics_json')
          .order('started_at', { ascending: false })
          .limit(5),
        supabase
          .from('ai_recap_editions')
          .select('id, edition_key, status, quality_report, published_at')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (!schedule) {
      checks.push({ key: 'schedule:exists', status: 'fail', message: 'Schedule row is missing' });
    } else {
      const slots = getScheduleSlots(schedule);
      const invalidSlots = slots.filter((slot) => !isValidAiRecapScheduleSlot(slot));
      checks.push({
        key: 'schedule:slots',
        status: schedule.is_enabled && invalidSlots.length === 0 ? 'pass' : 'fail',
        message:
          schedule.is_enabled && invalidSlots.length === 0
            ? 'Schedule enabled with valid A-E slots'
            : 'Schedule disabled or has invalid slots',
        details: { timezone: schedule.timezone, slots, invalidSlots },
      });
    }

    const activeSourceCount = sources?.length ?? 0;
    checks.push({
      key: 'sources:active',
      status: activeSourceCount >= 4 ? 'pass' : 'fail',
      message: activeSourceCount >= 4 ? 'Enough active recap sources configured' : 'At least 4 active recap sources are required',
      details: { activeSourceCount },
    });

    const themesWithoutSources = (dayThemes ?? []).filter((theme) => {
      const sourceIds = Array.isArray(theme.source_ids) ? theme.source_ids : [];
      return sourceIds.length === 0;
    });
    checks.push({
      key: 'day-themes:sources',
      status: themesWithoutSources.length === 0 && (dayThemes?.length ?? 0) >= 5 ? 'pass' : 'warn',
      message:
        themesWithoutSources.length === 0 && (dayThemes?.length ?? 0) >= 5
          ? 'All weekday themes have source sets'
          : 'Some active day themes are missing source sets',
      details: { activeThemes: dayThemes?.length ?? 0, themesWithoutSources },
    });

    const latestProblemRun = (latestRuns ?? []).find((run) => run.status === 'failed' || run.status === 'partial');
    checks.push({
      key: 'runs:last-status',
      status: latestProblemRun ? 'warn' : 'pass',
      message: latestProblemRun ? 'Recent failed or partial recap run found' : 'No failed or partial run in latest checks',
      details: latestProblemRun ? { latestProblemRun } : undefined,
    });

    if (!latestEdition?.id) {
      checks.push({ key: 'publication:latest', status: 'warn', message: 'No published recap edition found yet' });
    } else {
      const { data: posts } = await supabase
        .from('ai_recap_posts')
        .select('locale, is_published, content_json')
        .eq('edition_id', latestEdition.id);
      const readyLocales = new Set(
        (posts ?? [])
          .filter((post) => post.is_published && post.content_json && typeof post.content_json === 'object')
          .map((post) => post.locale),
      );
      checks.push({
        key: 'publication:bilingual',
        status: readyLocales.has('fr') && readyLocales.has('en') ? 'pass' : 'fail',
        message:
          readyLocales.has('fr') && readyLocales.has('en')
            ? 'Latest edition has published FR and EN posts'
            : 'Latest edition is missing published FR or EN posts',
        details: { editionKey: latestEdition.edition_key, readyLocales: Array.from(readyLocales) },
      });
    }

    const failed = checks.filter((check) => check.status === 'fail');
    const warned = checks.filter((check) => check.status === 'warn');
    await logAuditEvent({
      eventType: failed.length === 0 ? 'ai_recap.smoke.success' : 'ai_recap.smoke.failed',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { failed: failed.length, warned: warned.length },
    });

    return NextResponse.json({
      ready: failed.length === 0,
      failed: failed.length,
      warned: warned.length,
      checks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI recap smoke route error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.smoke.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: message },
    });
    return NextResponse.json({ error: message || 'Internal Server Error' }, { status: 500 });
  }
}
