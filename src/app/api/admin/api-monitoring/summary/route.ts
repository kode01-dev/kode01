import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { MONITORED_EXTERNAL_ENDPOINTS } from '@/features/api-monitoring/server/constants';
import { buildMonitoringRecommendedAlerts } from '@/features/api-monitoring/server/recommended-alerts';
import { parseApiMonitorRange, getAdminSessionOrNull } from '@/app/api/admin/api-monitoring/_lib';

type ApiCallRow = {
  endpoint: string;
  success: boolean;
  duration_ms: number;
  created_at: string;
  status_code: number | null;
};

type EndpointStateRow = {
  endpoint: string;
  health_status: 'green' | 'yellow' | 'red';
  error_rate_percent: number;
  last_success_at: string | null;
  last_checked_at: string;
};

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function computeP95Latency(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[index] ?? 0);
}

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.summary.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const url = new URL(request.url);
    const { range, fromDate } = parseApiMonitorRange(url.searchParams.get('range'));
    const fromIso = fromDate.toISOString();
    const toIso = new Date().toISOString();
    const admin = createAdminClient();

    const [{ data: callRows, error: callError }, { data: stateRows, error: stateError }] = await Promise.all([
      admin
        .from('external_api_call_events')
        .select('endpoint, success, duration_ms, status_code, created_at')
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(20_000),
      admin
        .from('api_monitor_endpoint_state')
        .select('endpoint, health_status, error_rate_percent, last_success_at, last_checked_at')
        .in('endpoint', [...MONITORED_EXTERNAL_ENDPOINTS]),
    ]);

    if (callError) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.summary.failed.query_calls',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: callError.message },
      });
      return NextResponse.json({ error: 'Failed to load monitoring summary' }, { status: 500 });
    }

    if (stateError) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.summary.failed.query_state',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: stateError.message },
      });
      return NextResponse.json({ error: 'Failed to load endpoint states' }, { status: 500 });
    }

    const rows = (callRows ?? []) as ApiCallRow[];
    const durations = rows
      .map((row) => Number(row.duration_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);

    const totalCalls = rows.length;
    const successCalls = rows.filter((row) => row.success).length;
    const errorCalls = Math.max(0, totalCalls - successCalls);
    const authErrorCount = rows.filter((row) => row.status_code === 401 || row.status_code === 403).length;
    const rateLimitCount = rows.filter((row) => row.status_code === 429).length;
    const successRatePercent = totalCalls > 0 ? toPercent((successCalls / totalCalls) * 100) : 0;
    const p95LatencyMs = computeP95Latency(durations);

    const stateMap = new Map<string, EndpointStateRow>();
    for (const row of (stateRows ?? []) as EndpointStateRow[]) {
      stateMap.set(row.endpoint, row);
    }

    const endpointStats = MONITORED_EXTERNAL_ENDPOINTS.map((endpoint) => {
      const endpointRows = rows.filter((row) => row.endpoint === endpoint);
      const endpointDurations = endpointRows
        .map((row) => Number(row.duration_ms))
        .filter((value) => Number.isFinite(value) && value >= 0);
      const endpointTotal = endpointRows.length;
      const endpointSuccess = endpointRows.filter((row) => row.success).length;
      const endpointError = Math.max(0, endpointTotal - endpointSuccess);
      const endpointSuccessRate = endpointTotal > 0 ? toPercent((endpointSuccess / endpointTotal) * 100) : 0;
      const state = stateMap.get(endpoint);

      return {
        endpoint,
        totalCalls: endpointTotal,
        successCalls: endpointSuccess,
        errorCalls: endpointError,
        successRatePercent: endpointSuccessRate,
        p95LatencyMs: computeP95Latency(endpointDurations),
        healthStatus: state?.health_status ?? 'green',
        errorRatePercent: Number(state?.error_rate_percent ?? 0),
        lastSuccessAt: state?.last_success_at ?? null,
        lastCheckedAt: state?.last_checked_at ?? null,
      };
    });

    const [
      recommendedAlerts,
      { count: retryingDeliveries, error: retryingError },
      { count: failedDeliveries, error: failedError },
    ] = await Promise.all([
      buildMonitoringRecommendedAlerts({ apiRows: rows }),
      admin
        .from('license_webhook_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'retrying')
        .gte('created_at', fromIso),
      admin
        .from('license_webhook_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', fromIso),
    ]);

    if (retryingError || failedError) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.summary.failed.query_deliveries',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          retrying_error: retryingError?.message ?? null,
          failed_error: failedError?.message ?? null,
        },
      });
      return NextResponse.json({ error: 'Failed to load delivery incidents' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        range,
        from: fromIso,
        to: toIso,
        kpis: {
          totalCalls,
          successCalls,
          errorCalls,
          successRatePercent,
          p95LatencyMs,
          authErrorCount,
          rateLimitCount,
          deliveryIncidents: (retryingDeliveries ?? 0) + (failedDeliveries ?? 0),
          retryingDeliveries: retryingDeliveries ?? 0,
          failedDeliveries: failedDeliveries ?? 0,
        },
        endpoints: endpointStats,
        recommendedAlerts,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/api-monitoring/summary error:', error);
    await logAuditEvent({
      eventType: 'admin.api_monitoring.summary.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
