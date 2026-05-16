import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

async function runPurge(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  const run = startCronRun(req, 'purge-bot-activity');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      await logAuditEvent({
        eventType: 'bot_activity_purge_unauthorized_attempt',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { run_id: run.runId },
      });
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const retentionDays = 90;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const admin = createAdminClient();

    const { count, error } = await admin
      .from('bot_activity')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      logCronFailed(run, error, { retentionDays, cutoff: cutoffDate.toISOString() });
      await logAuditEvent({
        eventType: 'bot_activity_purge_failed',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          run_id: run.runId,
          retention_days: retentionDays,
          cutoff: cutoffDate.toISOString(),
          error_message: error.message,
        },
      });
      return withCronHeaders(
        NextResponse.json({ error: 'Failed to purge bot activity' }, { status: 500 }),
        run,
      );
    }

    logCronSucceeded(run, { retentionDays, cutoff: cutoffDate.toISOString(), purged: count ?? 0 });
    await logAuditEvent({
      eventType: 'bot_activity_purged',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        retention_days: retentionDays,
        cutoff: cutoffDate.toISOString(),
        purged: count ?? 0,
      },
    });

    return withCronHeaders(NextResponse.json({
      success: true,
      retentionDays,
      cutoff: cutoffDate.toISOString(),
      purged: count ?? 0,
    }), run);
  } catch (error) {
    logCronFailed(run, error);
    await logAuditEvent({
      eventType: 'bot_activity_purge_failed',
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
