import { createAdminClient } from '@/lib/supabase/admin';

const RETENTION_MONTHS = 13;

function getCutoffDate(months: number): Date {
  const now = new Date();
  now.setMonth(now.getMonth() - months);
  return now;
}

export async function runPurgeCookieConsentTask(runId: string) {
  const cutoffDate = getCutoffDate(RETENTION_MONTHS);
  const admin = createAdminClient();

  const { count, error } = await admin
    .from('cookie_consent_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffDate.toISOString());

  if (error) {
    throw error;
  }

  const purgedCount = count ?? 0;
  const { error: auditError } = await admin.from('audit_logs').insert({
    event_type: 'cookie_consent_events_purged',
    metadata: {
      run_id: runId,
      retention_months: RETENTION_MONTHS,
      cutoff: cutoffDate.toISOString(),
      purged: purgedCount,
    },
  });

  if (auditError) {
    console.error('Failed to write purge audit log:', auditError);
  }

  return {
    retentionMonths: RETENTION_MONTHS,
    cutoff: cutoffDate.toISOString(),
    purged: purgedCount,
  };
}
