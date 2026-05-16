import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchNotification } from '@/features/notifications/server/dispatch';
import { MONITORED_EXTERNAL_ENDPOINTS } from './constants';
import {
  classifyEndpointHealth,
  computeErrorRatePercent,
  shouldSendRedAlert,
  toRoundedPercent,
  type EndpointHealthStatus,
} from './health';

type EndpointStateRow = {
  endpoint: string;
  health_status: EndpointHealthStatus;
  last_alerted_red_at: string | null;
};

export type EndpointHealthSnapshot = {
  endpoint: string;
  healthStatus: EndpointHealthStatus;
  errorRatePercent: number;
  windowTotal: number;
  windowError: number;
  attemptsLast30m: number;
  successesLast30m: number;
  lastSuccessAt: string | null;
};

export type ApiMonitorHealthRunResult = {
  checkedAt: string;
  endpoints: EndpointHealthSnapshot[];
  alertTransitions: string[];
  notificationsSent: number;
};

async function countEndpointEvents(input: {
  endpoint: string;
  sinceIso: string;
  success?: boolean;
}): Promise<number> {
  const admin = createAdminClient();
  let query = admin
    .from('external_api_call_events')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', input.endpoint)
    .gte('created_at', input.sinceIso);

  if (typeof input.success === 'boolean') {
    query = query.eq('success', input.success);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchLastSuccessAt(endpoint: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('external_api_call_events')
    .select('created_at')
    .eq('endpoint', endpoint)
    .eq('success', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.created_at ?? null;
}

async function computeEndpointSnapshot(endpoint: string): Promise<EndpointHealthSnapshot> {
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30mIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [
    windowTotal,
    windowSuccess,
    attemptsLast30m,
    successesLast30m,
    lastSuccessAt,
  ] = await Promise.all([
    countEndpointEvents({ endpoint, sinceIso: since24hIso }),
    countEndpointEvents({ endpoint, sinceIso: since24hIso, success: true }),
    countEndpointEvents({ endpoint, sinceIso: since30mIso }),
    countEndpointEvents({ endpoint, sinceIso: since30mIso, success: true }),
    fetchLastSuccessAt(endpoint),
  ]);

  const windowError = Math.max(0, windowTotal - windowSuccess);
  const errorRatePercent = toRoundedPercent(computeErrorRatePercent(windowTotal, windowError), 4);
  const healthStatus = classifyEndpointHealth({
    errorRatePercent,
    attemptsLast30m,
    successesLast30m,
  });

  return {
    endpoint,
    healthStatus,
    errorRatePercent,
    windowTotal,
    windowError,
    attemptsLast30m,
    successesLast30m,
    lastSuccessAt,
  };
}

async function loadPreviousEndpointStates(): Promise<Map<string, EndpointStateRow>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_monitor_endpoint_state')
    .select('endpoint, health_status, last_alerted_red_at')
    .in('endpoint', [...MONITORED_EXTERNAL_ENDPOINTS]);

  if (error) throw new Error(error.message);

  const map = new Map<string, EndpointStateRow>();
  for (const row of (data ?? []) as EndpointStateRow[]) {
    map.set(row.endpoint, row);
  }
  return map;
}

async function sendEndpointRedAlerts(endpoints: EndpointHealthSnapshot[]): Promise<number> {
  if (endpoints.length === 0) return 0;
  const admin = createAdminClient();
  const { data: adminRows, error } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (error) throw new Error(error.message);
  const adminIds = (adminRows ?? [])
    .map((row) => row.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (adminIds.length === 0) return 0;

  let sent = 0;
  for (const endpoint of endpoints) {
    for (const adminId of adminIds) {
      try {
        await dispatchNotification({
          recipientUserId: adminId,
          templateKey: 'api_monitor_endpoint_unhealthy',
          locale: 'en',
          metadata: {
            endpoint: endpoint.endpoint,
            errorRate: endpoint.errorRatePercent.toFixed(2),
            windowHours: '24',
            windowTotal: String(endpoint.windowTotal),
            windowError: String(endpoint.windowError),
          },
          email: { enabled: false },
          link: '/admin/api-monitoring',
        });
        sent += 1;
      } catch (notificationError) {
        console.error('Failed to send API monitor alert notification:', notificationError);
      }
    }
  }
  return sent;
}

export async function runApiMonitorHealthEvaluation(): Promise<ApiMonitorHealthRunResult> {
  const checkedAt = new Date().toISOString();
  const previousStateByEndpoint = await loadPreviousEndpointStates();
  const endpointSnapshots = await Promise.all(
    MONITORED_EXTERNAL_ENDPOINTS.map((endpoint) => computeEndpointSnapshot(endpoint)),
  );

  const alertTransitions = endpointSnapshots
    .filter((snapshot) => {
      const previousStatus = previousStateByEndpoint.get(snapshot.endpoint)?.health_status ?? null;
      return shouldSendRedAlert(previousStatus, snapshot.healthStatus);
    })
    .map((snapshot) => snapshot.endpoint);

  const nowIso = new Date().toISOString();
  const upsertRows = endpointSnapshots.map((snapshot) => {
    const previous = previousStateByEndpoint.get(snapshot.endpoint);
    const shouldMarkAlert = shouldSendRedAlert(previous?.health_status ?? null, snapshot.healthStatus);
    const keepPreviousAlertTimestamp = previous?.last_alerted_red_at ?? null;

    return {
      endpoint: snapshot.endpoint,
      health_status: snapshot.healthStatus,
      error_rate_percent: snapshot.errorRatePercent,
      window_total: snapshot.windowTotal,
      window_error: snapshot.windowError,
      last_success_at: snapshot.lastSuccessAt,
      last_checked_at: nowIso,
      last_alerted_red_at: shouldMarkAlert ? nowIso : keepPreviousAlertTimestamp,
    };
  });

  const admin = createAdminClient();
  const { error: upsertError } = await admin
    .from('api_monitor_endpoint_state')
    .upsert(upsertRows, { onConflict: 'endpoint' });

  if (upsertError) throw new Error(upsertError.message);

  const redEndpoints = endpointSnapshots.filter((snapshot) => alertTransitions.includes(snapshot.endpoint));
  const notificationsSent = await sendEndpointRedAlerts(redEndpoints);

  return {
    checkedAt,
    endpoints: endpointSnapshots,
    alertTransitions,
    notificationsSent,
  };
}
