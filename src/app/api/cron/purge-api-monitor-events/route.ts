import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { API_MONITOR_RETENTION_DAYS } from '@/features/api-monitoring/server/constants';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

function getCutoffIso(): string {
  return new Date(Date.now() - API_MONITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function runPurge(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  const run = startCronRun(req, 'purge-api-monitor-events');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      await logAuditEvent({
        eventType: 'api_monitor_events_purge.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { run_id: run.runId },
      });
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const cutoff = getCutoffIso();
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('external_api_call_events')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    if (error) {
      logCronFailed(run, error, { cutoff, retentionDays: API_MONITOR_RETENTION_DAYS });
      await logAuditEvent({
        eventType: 'api_monitor_events_purge.failed.query',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          run_id: run.runId,
          retention_days: API_MONITOR_RETENTION_DAYS,
          cutoff,
          error_message: error.message,
        },
      });
      return withCronHeaders(NextResponse.json({ error: 'Failed to purge API monitor events' }, { status: 500 }), run);
    }

    const purged = count ?? 0;
    logCronSucceeded(run, { retentionDays: API_MONITOR_RETENTION_DAYS, cutoff, purged });
    await logAuditEvent({
      eventType: 'api_monitor_events_purge.success',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        retention_days: API_MONITOR_RETENTION_DAYS,
        cutoff,
        purged,
      },
    });

    return withCronHeaders(NextResponse.json({
      success: true,
      retentionDays: API_MONITOR_RETENTION_DAYS,
      cutoff,
      purged,
    }), run);
  } catch (error) {
    logCronFailed(run, error);
    await logAuditEvent({
      eventType: 'api_monitor_events_purge.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return withCronHeaders(NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }), run);
  }
}

export async function GET(req: Request) {
  return runPurge(req);
}

export async function POST(req: Request) {
  return runPurge(req);
}
