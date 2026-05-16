import { NextResponse } from 'next/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { runApiMonitorHealthEvaluation } from '@/features/api-monitoring/server/health-runner';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

async function runHealthCron(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  const run = startCronRun(req, 'api-monitor-health');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      await logAuditEvent({
        eventType: 'api_monitor_health.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { run_id: run.runId },
      });
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const result = await runApiMonitorHealthEvaluation();
    logCronSucceeded(run, {
      checkedAt: result.checkedAt,
      notificationsSent: result.notificationsSent,
      endpointCount: result.endpoints.length,
    });
    await logAuditEvent({
      eventType: 'api_monitor_health.success',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        checked_at: result.checkedAt,
        alert_transitions: result.alertTransitions,
        notifications_sent: result.notificationsSent,
        endpoint_count: result.endpoints.length,
      },
    });

    return withCronHeaders(NextResponse.json({
      success: true,
      ...result,
    }), run);
  } catch (error) {
    logCronFailed(run, error);
    await logAuditEvent({
      eventType: 'api_monitor_health.failed.internal_error',
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
  return runHealthCron(req);
}

export async function POST(req: Request) {
  return runHealthCron(req);
}
