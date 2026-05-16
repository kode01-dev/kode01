import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

const RETENTION_MONTHS = 13;

function getCutoffDate(months: number): Date {
  const now = new Date();
  now.setMonth(now.getMonth() - months);
  return now;
}

async function runPurge(req: Request) {
  const run = startCronRun(req, 'purge-cookie-consent-events');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const cutoffDate = getCutoffDate(RETENTION_MONTHS);
    const admin = createAdminClient();

    const { count, error } = await admin
      .from('cookie_consent_events')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      logCronFailed(run, error, { retentionMonths: RETENTION_MONTHS, cutoff: cutoffDate.toISOString() });
      return withCronHeaders(NextResponse.json({ error: 'Failed to purge cookie consent events' }, { status: 500 }), run);
    }

    const purgedCount = count ?? 0;
    const { error: auditError } = await admin.from('audit_logs').insert({
      event_type: 'cookie_consent_events_purged',
      metadata: {
        run_id: run.runId,
        retention_months: RETENTION_MONTHS,
        cutoff: cutoffDate.toISOString(),
        purged: purgedCount,
      },
    });

    if (auditError) {
      console.error('Failed to write purge audit log:', auditError);
    }

    logCronSucceeded(run, {
      retentionMonths: RETENTION_MONTHS,
      cutoff: cutoffDate.toISOString(),
      purged: purgedCount,
    });

    return withCronHeaders(NextResponse.json({
      success: true,
      retentionMonths: RETENTION_MONTHS,
      cutoff: cutoffDate.toISOString(),
      purged: purgedCount,
    }), run);
  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }), run);
  }
}

export async function GET(req: Request) {
  return runPurge(req);
}

export async function POST(req: Request) {
  return runPurge(req);
}
