import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { getDirectDatabaseUrlConfig } from '@/lib/db/direct-database-url';

type ApiCallRow = {
  endpoint: string;
  success: boolean;
  duration_ms: number;
  created_at: string;
};

type SloContracts = {
  global?: {
    api_p95_ms?: number;
    error_rate_percent?: number;
  };
  endpoints?: Record<string, { p95_ms?: number; error_rate_percent?: number }>;
};

type SharedReadQueryRow = {
  queryid: string | null;
  calls: string | number;
  shared_blks_read: string | number;
  mean_exec_time_ms: string | number;
  sample_query: string;
};

type RealtimeMeanRow = {
  calls: string | number | null;
  mean_exec_time_ms: string | number | null;
};

export type MonitoringAlertStatus = 'ok' | 'warning' | 'firing' | 'unavailable';
export type MonitoringAlertSeverity = 'info' | 'warning' | 'critical';

export type MonitoringAlert = {
  key: string;
  title: string;
  status: MonitoringAlertStatus;
  severity: MonitoringAlertSeverity;
  window: string;
  threshold: string;
  summary: string;
  value: string;
  details?: Record<string, unknown>;
};

const ALERT_P95_WINDOW_MINUTES = 10;
const ALERT_ERROR_WINDOW_MINUTES = 5;
const ALERT_ERROR_RATE_PERCENT = 1;
const ALERT_SHARED_READ_SPIKE_MIN_CALLS = 30;
const ALERT_SHARED_READ_SPIKE_PER_CALL = 20;
const ALERT_REALTIME_MEAN_BASELINE_MS = 5.5;
const ALERT_REALTIME_MEAN_DRIFT_FACTOR = 1.8;
const ALERT_FAILED_CRON_WINDOW_MINUTES = 30;
const ALERT_FAILED_MIGRATION_WINDOW_HOURS = 24;

function unavailableDbAlerts(message: string): {
  sharedReadAlert: MonitoringAlert;
  realtimeDriftAlert: MonitoringAlert;
  migrationCronAlert: MonitoringAlert;
} {
  return {
    sharedReadAlert: {
      key: 'shared_blks_read_spike',
      title: 'Shared blocks read spike on business query',
      status: 'unavailable',
      severity: 'warning',
      window: 'current stats window',
      threshold: 'top query read-per-call spike',
      summary: message,
      value: 'n/a',
    },
    realtimeDriftAlert: {
      key: 'realtime_list_changes_mean_drift',
      title: 'realtime.list_changes mean time drift',
      status: 'unavailable',
      severity: 'warning',
      window: 'current stats window',
      threshold: `mean exec > ${round(ALERT_REALTIME_MEAN_BASELINE_MS * ALERT_REALTIME_MEAN_DRIFT_FACTOR, 2)} ms`,
      summary: message,
      value: 'n/a',
    },
    migrationCronAlert: {
      key: 'failed_migrations_or_cron_jobs',
      title: 'Failed migrations / failed cron jobs',
      status: 'unavailable',
      severity: 'warning',
      window: `${ALERT_FAILED_CRON_WINDOW_MINUTES}m / ${ALERT_FAILED_MIGRATION_WINDOW_HOURS}h`,
      threshold: '0 failures',
      summary: message,
      value: 'n/a',
    },
  };
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  const qIndex = trimmed.indexOf('?');
  return qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
}

function resolveEndpointSloP95(endpoint: string, sloContracts: SloContracts | null): number {
  const endpointKey = normalizeEndpoint(endpoint);
  const endpointSlo = sloContracts?.endpoints?.[endpointKey]?.p95_ms;
  if (typeof endpointSlo === 'number' && Number.isFinite(endpointSlo) && endpointSlo > 0) {
    return endpointSlo;
  }
  const globalP95 = sloContracts?.global?.api_p95_ms;
  if (typeof globalP95 === 'number' && Number.isFinite(globalP95) && globalP95 > 0) {
    return globalP95;
  }
  return 200;
}

async function readSloContracts(): Promise<SloContracts | null> {
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), 'config', 'performance', 'slo-contracts.json'),
      'utf8',
    );
    return JSON.parse(raw) as SloContracts;
  } catch {
    return null;
  }
}

async function readLocalMigrationVersions(): Promise<string[]> {
  try {
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^\d+.*\.sql$/i.test(entry.name))
      .map((entry) => entry.name.split('_')[0] ?? '')
      .filter((version) => version.length > 0);
  } catch {
    return [];
  }
}

async function computeDatabaseSignals(): Promise<{
  sharedReadAlert: MonitoringAlert;
  realtimeDriftAlert: MonitoringAlert;
  migrationCronAlert: MonitoringAlert;
}> {
  const database = getDirectDatabaseUrlConfig();
  if (!database.url) {
    return unavailableDbAlerts('DATABASE_URL or SUPABASE_DB_URL_POOLING is not configured in runtime environment.');
  }

  if (database.blockedReason) {
    return unavailableDbAlerts(database.blockedReason);
  }

  const sql = postgres(database.url, { max: 1, idle_timeout: 5 });
  try {
    const [sharedRows, realtimeRows] = await Promise.all([
      sql<SharedReadQueryRow[]>`
        SELECT
          queryid::text AS queryid,
          calls,
          shared_blks_read,
          ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
          LEFT(regexp_replace(query, '\s+', ' ', 'g'), 220) AS sample_query
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND query ~* '^(select|with|update|insert|delete)'
          AND query NOT ILIKE '%pg_catalog%'
          AND query NOT ILIKE '%information_schema%'
          AND query NOT ILIKE 'select set_config%'
          AND query NOT ILIKE '%pg_timezone_names%'
          AND query NOT ILIKE '%pg_publication_tables%'
          AND query NOT ILIKE '%pg_available_extensions%'
          AND query NOT ILIKE '%pgrst.db_pre_request%'
          AND (
            query ILIKE '%public.%'
            OR query ILIKE '%"public".%'
          )
        ORDER BY shared_blks_read DESC
        LIMIT 30
      `,
      sql<RealtimeMeanRow[]>`
        SELECT
          COALESCE(SUM(calls), 0) AS calls,
          ROUND(COALESCE(SUM(total_exec_time), 0)::numeric / NULLIF(COALESCE(SUM(calls), 0), 0), 2) AS mean_exec_time_ms
        FROM pg_stat_statements
        WHERE query ~* '^SELECT\\s+wal->>'
          AND query ILIKE '%FROM realtime.list_changes%'
      `,
    ]);

    const readPerCallValues = sharedRows
      .map((row) => {
        const calls = Math.max(1, toFiniteNumber(row.calls));
        const sharedRead = toFiniteNumber(row.shared_blks_read);
        return sharedRead / calls;
      })
      .filter((value) => Number.isFinite(value) && value >= 0);

    const topShared = sharedRows[0] ?? null;
    const topSharedCalls = topShared ? Math.max(0, toFiniteNumber(topShared.calls)) : 0;
    const topSharedRead = topShared ? Math.max(0, toFiniteNumber(topShared.shared_blks_read)) : 0;
    const topSharedPerCall = topSharedCalls > 0 ? topSharedRead / topSharedCalls : 0;
    const medianSharedPerCall = median(readPerCallValues);

    const sharedSpike =
      topShared !== null
      && topSharedCalls >= ALERT_SHARED_READ_SPIKE_MIN_CALLS
      && topSharedPerCall >= ALERT_SHARED_READ_SPIKE_PER_CALL
      && topSharedPerCall >= Math.max(3, medianSharedPerCall * 3);

    const sharedReadAlert: MonitoringAlert = {
      key: 'shared_blks_read_spike',
      title: 'Shared blocks read spike on business query',
      status: sharedSpike ? 'firing' : 'ok',
      severity: sharedSpike ? 'critical' : 'info',
      window: 'current pg_stat_statements window',
      threshold: `top query read/call >= ${ALERT_SHARED_READ_SPIKE_PER_CALL} (calls >= ${ALERT_SHARED_READ_SPIKE_MIN_CALLS})`,
      summary: topShared
        ? `Top business query read/call=${round(topSharedPerCall, 2)} (median=${round(medianSharedPerCall, 2)}).`
        : 'No business queries found in pg_stat_statements.',
      value: topShared ? `${round(topSharedPerCall, 2)} read/call` : '0 read/call',
      details: topShared
        ? {
          queryId: topShared.queryid,
          calls: topSharedCalls,
          sharedBlksRead: topSharedRead,
          sample: topShared.sample_query,
        }
        : undefined,
    };

    const realtime = realtimeRows[0] ?? null;
    const realtimeCalls = realtime ? Math.max(0, toFiniteNumber(realtime.calls)) : 0;
    const realtimeMean = realtime ? Math.max(0, toFiniteNumber(realtime.mean_exec_time_ms)) : 0;
    const realtimeThreshold = round(ALERT_REALTIME_MEAN_BASELINE_MS * ALERT_REALTIME_MEAN_DRIFT_FACTOR, 2);
    const realtimeDrift = realtimeCalls >= 100 && realtimeMean > realtimeThreshold;

    const realtimeDriftAlert: MonitoringAlert = {
      key: 'realtime_list_changes_mean_drift',
      title: 'realtime.list_changes mean time drift',
      status: realtimeCalls === 0 ? 'unavailable' : realtimeDrift ? 'firing' : 'ok',
      severity: realtimeDrift ? 'critical' : 'info',
      window: 'current pg_stat_statements window',
      threshold: `mean exec > ${realtimeThreshold} ms`,
      summary: realtimeCalls === 0
        ? 'No realtime.list_changes execution observed yet.'
        : `Weighted mean execution time is ${round(realtimeMean, 2)} ms across ${realtimeCalls} calls.`,
      value: `${round(realtimeMean, 2)} ms`,
      details: { calls: realtimeCalls, baselineMs: ALERT_REALTIME_MEAN_BASELINE_MS },
    };

    const [migrationFailureRows, auditCronFailureRows, pgCronAvailableRows] = await Promise.all([
      sql<{ c: string | number }[]>`
        SELECT COUNT(*) AS c
        FROM public.audit_logs
        WHERE created_at >= (now() - (${ALERT_FAILED_MIGRATION_WINDOW_HOURS} * INTERVAL '1 hour'))
          AND event_type ILIKE '%migration%'
          AND event_type ILIKE '%failed%'
      `,
      sql<{ c: string | number }[]>`
        SELECT COUNT(*) AS c
        FROM public.audit_logs
        WHERE created_at >= (now() - (${ALERT_FAILED_CRON_WINDOW_MINUTES} * INTERVAL '1 minute'))
          AND (
            (event_type ILIKE '%cron%' AND event_type ILIKE '%failed%')
            OR event_type ILIKE 'api_monitor_health.failed.%'
            OR event_type ILIKE 'license_webhook_cron.failed%'
          )
      `,
      sql<{ enabled: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
        ) AS enabled
      `,
    ]);

    let pgCronFailedCount = 0;
    if (pgCronAvailableRows[0]?.enabled) {
      try {
        const pgCronRows = await sql<{ c: string | number }[]>`
          SELECT COUNT(*) AS c
          FROM cron.job_run_details
          WHERE start_time >= (now() - (${ALERT_FAILED_CRON_WINDOW_MINUTES} * INTERVAL '1 minute'))
            AND status ILIKE 'failed%'
        `;
        pgCronFailedCount = Math.max(0, toFiniteNumber(pgCronRows[0]?.c ?? 0));
      } catch {
        pgCronFailedCount = 0;
      }
    }

    const migrationFailures = Math.max(0, toFiniteNumber(migrationFailureRows[0]?.c ?? 0));
    const auditCronFailures = Math.max(0, toFiniteNumber(auditCronFailureRows[0]?.c ?? 0));

    const localVersions = await readLocalMigrationVersions();
    const appliedRows = await sql<{ version: string }[]>`
      SELECT version::text AS version
      FROM supabase_migrations.schema_migrations
    `;
    const appliedSet = new Set((appliedRows ?? []).map((row) => row.version));
    const pendingMigrations = localVersions.filter((version) => !appliedSet.has(version)).length;

    const cronFailures = Math.max(pgCronFailedCount, auditCronFailures);
    const hasHardFailure = migrationFailures > 0 || cronFailures > 0;
    const hasWarning = !hasHardFailure && pendingMigrations > 0;

    const migrationCronAlert: MonitoringAlert = {
      key: 'failed_migrations_or_cron_jobs',
      title: 'Failed migrations / failed cron jobs',
      status: hasHardFailure ? 'firing' : hasWarning ? 'warning' : 'ok',
      severity: hasHardFailure ? 'critical' : hasWarning ? 'warning' : 'info',
      window: `${ALERT_FAILED_CRON_WINDOW_MINUTES}m / ${ALERT_FAILED_MIGRATION_WINDOW_HOURS}h`,
      threshold: '0 failures',
      summary: hasHardFailure
        ? `Detected ${cronFailures} cron failure(s) and ${migrationFailures} migration failure event(s).`
        : hasWarning
          ? `${pendingMigrations} local migration(s) are not applied on remote.`
          : 'No failed migration events or failed cron jobs detected.',
      value: `cron=${cronFailures}, migration_failed=${migrationFailures}, pending=${pendingMigrations}`,
      details: {
        cronFailures,
        migrationFailures,
        pendingMigrations,
        pgCronFailures: pgCronFailedCount,
        auditCronFailures,
      },
    };

    return { sharedReadAlert, realtimeDriftAlert, migrationCronAlert };
  } catch (error) {
    const message = error instanceof Error
      ? `DB alert signals unavailable: ${error.message}`
      : 'DB alert signals unavailable due to unexpected error.';
    return unavailableDbAlerts(message);
  } finally {
    await sql.end();
  }
}

export async function buildMonitoringRecommendedAlerts(input: {
  apiRows: ApiCallRow[];
}): Promise<{
  evaluatedAt: string;
  alerts: MonitoringAlert[];
}> {
  const now = new Date();
  const nowMs = now.getTime();
  const since10m = nowMs - ALERT_P95_WINDOW_MINUTES * 60 * 1000;
  const since5m = nowMs - ALERT_ERROR_WINDOW_MINUTES * 60 * 1000;

  const sloContracts = await readSloContracts();
  const rows10m = input.apiRows.filter((row) => {
    const ts = new Date(row.created_at).getTime();
    return Number.isFinite(ts) && ts >= since10m;
  });
  const rows5m = input.apiRows.filter((row) => {
    const ts = new Date(row.created_at).getTime();
    return Number.isFinite(ts) && ts >= since5m;
  });

  const endpointDurations = new Map<string, number[]>();
  for (const row of rows10m) {
    const key = normalizeEndpoint(row.endpoint);
    const value = toFiniteNumber(row.duration_ms);
    if (!endpointDurations.has(key)) endpointDurations.set(key, []);
    endpointDurations.get(key)?.push(value);
  }

  const p95Breaches: Array<{ endpoint: string; p95: number; slo: number; samples: number }> = [];
  for (const [endpoint, durations] of endpointDurations.entries()) {
    if (durations.length === 0) continue;
    const endpointP95 = percentile(durations, 0.95);
    const endpointSlo = resolveEndpointSloP95(endpoint, sloContracts);
    if (endpointP95 > endpointSlo) {
      p95Breaches.push({
        endpoint,
        p95: round(endpointP95, 2),
        slo: round(endpointSlo, 2),
        samples: durations.length,
      });
    }
  }

  const p95Alert: MonitoringAlert = {
    key: 'endpoint_p95_slo_10m',
    title: 'p95 endpoint > SLO for 10 minutes',
    status: p95Breaches.length > 0 ? 'firing' : 'ok',
    severity: p95Breaches.length > 0 ? 'critical' : 'info',
    window: '10m',
    threshold: 'p95 <= endpoint SLO',
    summary: p95Breaches.length > 0
      ? `${p95Breaches.length} endpoint(s) above SLO in last 10m.`
      : 'All monitored endpoint p95 values are within SLO in last 10m.',
    value: `${p95Breaches.length} breach(es)`,
    details: p95Breaches.length > 0 ? { breaches: p95Breaches } : undefined,
  };

  const total5m = rows5m.length;
  const errors5m = rows5m.filter((row) => !row.success).length;
  const errorRate5m = total5m > 0 ? (errors5m / total5m) * 100 : 0;
  const errorAlert: MonitoringAlert = {
    key: 'error_rate_5m',
    title: 'Error rate > 1% for 5 minutes',
    status: total5m > 0 && errorRate5m > ALERT_ERROR_RATE_PERCENT ? 'firing' : 'ok',
    severity: total5m > 0 && errorRate5m > ALERT_ERROR_RATE_PERCENT ? 'critical' : 'info',
    window: '5m',
    threshold: `error_rate <= ${ALERT_ERROR_RATE_PERCENT}%`,
    summary: total5m === 0
      ? 'No API calls observed in the last 5m.'
      : `Error rate is ${round(errorRate5m, 2)}% over ${total5m} calls.`,
    value: `${round(errorRate5m, 2)}%`,
    details: { totalCalls: total5m, errorCalls: errors5m },
  };

  const dbSignals = await computeDatabaseSignals();

  return {
    evaluatedAt: now.toISOString(),
    alerts: [
      p95Alert,
      errorAlert,
      dbSignals.sharedReadAlert,
      dbSignals.realtimeDriftAlert,
      dbSignals.migrationCronAlert,
    ],
  };
}
