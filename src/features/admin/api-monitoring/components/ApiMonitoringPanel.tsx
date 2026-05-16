'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { DashboardShellSkeleton } from '@/components/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { parseAsEnumParam, replaceHistoryOptions } from '@/lib/url-query/parsers';

type SummaryRange = '24h' | '7d' | '30d';
type DeliveryStatusFilter = 'all' | 'failed' | 'retrying';
type MonitoringAlertStatus = 'ok' | 'warning' | 'firing' | 'unavailable';
type MonitoringAlertSeverity = 'info' | 'warning' | 'critical';

type MonitoringAlert = {
  key: string;
  title: string;
  status: MonitoringAlertStatus;
  severity: MonitoringAlertSeverity;
  window: string;
  threshold: string;
  summary: string;
  value: string;
};

type SummaryResponse = {
  data: {
    range: SummaryRange;
    from: string;
    to: string;
    kpis: {
      totalCalls: number;
      successCalls: number;
      errorCalls: number;
      successRatePercent: number;
      p95LatencyMs: number;
      authErrorCount: number;
      rateLimitCount: number;
      deliveryIncidents: number;
      retryingDeliveries: number;
      failedDeliveries: number;
    };
    endpoints: Array<{
      endpoint: string;
      totalCalls: number;
      successCalls: number;
      errorCalls: number;
      successRatePercent: number;
      p95LatencyMs: number;
      healthStatus: 'green' | 'yellow' | 'red';
      errorRatePercent: number;
      lastSuccessAt: string | null;
      lastCheckedAt: string | null;
    }>;
    recommendedAlerts: {
      evaluatedAt: string;
      alerts: MonitoringAlert[];
    };
  };
};

type DeliveryRow = {
  id: string;
  event_id: string;
  event_type: string;
  endpoint_url: string;
  status: 'pending' | 'retrying' | 'sent' | 'failed' | 'cancelled';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_response_status: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type DeliveriesResponse = {
  data: DeliveryRow[];
};

type RetryResponse = {
  delivery: DeliveryRow;
  worker: {
    triggered: boolean;
    reason: string | null;
    status: number | null;
  };
};

const SUMMARY_RANGE_VALUES = ['24h', '7d', '30d'] as const;
const DELIVERY_STATUS_VALUES = ['all', 'failed', 'retrying'] as const;

const apiMonitoringFilterParsers = {
  range: parseAsEnumParam(SUMMARY_RANGE_VALUES, '24h'),
  deliveryStatus: parseAsEnumParam(DELIVERY_STATUS_VALUES, 'all'),
};

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.toLowerCase().startsWith('fr') ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function healthBadgeClass(status: 'green' | 'yellow' | 'red') {
  if (status === 'red') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'yellow') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function alertStatusBadgeClass(status: MonitoringAlertStatus) {
  if (status === 'firing') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'unavailable') return 'bg-slate-100 text-slate-700 border-slate-300';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function alertSeverityClass(severity: MonitoringAlertSeverity) {
  if (severity === 'critical') return 'text-red-700';
  if (severity === 'warning') return 'text-amber-700';
  return 'text-emerald-700';
}

export function ApiMonitoringPanel({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.admin.api_monitoring');
  const [query, setQuery] = useQueryStates(
    apiMonitoringFilterParsers,
    replaceHistoryOptions,
  );
  const range = query.range;
  const [summary, setSummary] = useState<SummaryResponse['data'] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const deliveryStatus = query.deliveryStatus;
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadSummary = useCallback(async (nextRange: SummaryRange) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const response = await fetch(`/api/admin/api-monitoring/summary?range=${nextRange}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as SummaryResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.summary_load_failed'));
      }
      setSummary((payload as SummaryResponse).data);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : t('errors.summary_load_failed'));
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [t]);

  const loadDeliveries = useCallback(async (nextStatus: DeliveryStatusFilter) => {
    setDeliveriesLoading(true);
    setDeliveriesError(null);
    try {
      const params = new URLSearchParams({
        limit: '50',
      });
      if (nextStatus !== 'all') params.set('status', nextStatus);
      const response = await fetch(`/api/admin/api-monitoring/deliveries?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as DeliveriesResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.deliveries_load_failed'));
      }
      setDeliveries((payload as DeliveriesResponse).data ?? []);
    } catch (error) {
      setDeliveriesError(error instanceof Error ? error.message : t('errors.deliveries_load_failed'));
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSummary(range);
  }, [range, loadSummary]);

  useEffect(() => {
    void loadDeliveries(deliveryStatus);
  }, [deliveryStatus, loadDeliveries]);

  async function handleRetry(deliveryId: string) {
    if (retryingId) return;
    setRetryingId(deliveryId);
    try {
      const response = await fetch(`/api/admin/api-monitoring/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as RetryResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.retry_failed'));
      }
      await loadDeliveries(deliveryStatus);
      await loadSummary(range);
    } catch (error) {
      setDeliveriesError(error instanceof Error ? error.message : t('errors.retry_failed'));
    } finally {
      setRetryingId(null);
    }
  }

  function handleRefresh() {
    void loadSummary(range);
    void loadDeliveries(deliveryStatus);
  }

  if (summaryLoading && !summary) {
    return <DashboardShellSkeleton embedded cards={4} showCharts={false} showTable />;
  }

  const kpis = summary?.kpis;

  return (
    <div className="space-y-6">
      <Card className="rounded-[32px] border-black/5 bg-kode01-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {t('overview_title')}
            </CardTitle>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
              {t('overview_subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(event) => {
                void setQuery({
                  range: event.target.value === '24h'
                    ? null
                    : event.target.value as SummaryRange,
                });
              }}
              className="h-10 rounded-2xl border border-black/10 px-3 text-sm font-semibold"
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="rounded-full"
            >
              <RefreshCw size={14} className={summaryLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {summaryError ? (
            <p className="text-sm font-semibold text-red-600">{summaryError}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  {t('kpis.total_calls')}
                </p>
                <p className="mt-2 text-3xl font-serif font-black text-kode01-noir">
                  {kpis?.totalCalls ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  {t('kpis.success_rate')}
                </p>
                <p className="mt-2 text-3xl font-serif font-black text-kode01-noir">
                  {kpis?.successRatePercent.toFixed(2) ?? '0.00'}%
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  {t('kpis.p95_latency')}
                </p>
                <p className="mt-2 text-3xl font-serif font-black text-kode01-noir">
                  {kpis?.p95LatencyMs ?? 0}ms
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  {t('kpis.delivery_incidents')}
                </p>
                <p className="mt-2 text-3xl font-serif font-black text-kode01-noir">
                  {kpis?.deliveryIncidents ?? 0}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-semibold text-kode01-noir/60 md:grid-cols-3">
            <div className="rounded-xl border border-black/10 p-3">
              {t('kpis.auth_errors')}: {kpis?.authErrorCount ?? 0}
            </div>
            <div className="rounded-xl border border-black/10 p-3">
              {t('kpis.rate_limited')}: {kpis?.rateLimitCount ?? 0}
            </div>
            <div className="rounded-xl border border-black/10 p-3">
              {t('kpis.errors')}: {kpis?.errorCalls ?? 0}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-black/5 bg-kode01-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('recommended_alerts.title')}
          </CardTitle>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
            {t('recommended_alerts.subtitle')}
            {' '}
            {formatDateTime(summary?.recommendedAlerts?.evaluatedAt ?? null, locale)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-black/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
                  <th className="px-3 py-3">{t('recommended_alerts.table.alert')}</th>
                  <th className="px-3 py-3">{t('recommended_alerts.table.status')}</th>
                  <th className="px-3 py-3">{t('recommended_alerts.table.window')}</th>
                  <th className="px-3 py-3">{t('recommended_alerts.table.threshold')}</th>
                  <th className="px-3 py-3">{t('recommended_alerts.table.value')}</th>
                  <th className="px-3 py-3">{t('recommended_alerts.table.summary')}</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recommendedAlerts?.alerts ?? []).map((alert) => (
                  <tr key={alert.key} className="border-b border-black/5 align-top">
                    <td className="px-3 py-3">
                      <p className="text-xs font-semibold">{alert.title}</p>
                      <p className={`mt-1 text-[10px] font-bold uppercase tracking-widest ${alertSeverityClass(alert.severity)}`}>
                        {t(`recommended_alerts.severity.${alert.severity}`)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${alertStatusBadgeClass(alert.status)}`}
                      >
                        {t(`statuses.alert.${alert.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">{alert.window}</td>
                    <td className="px-3 py-3 text-xs">{alert.threshold}</td>
                    <td className="px-3 py-3 text-xs font-semibold">{alert.value}</td>
                    <td className="px-3 py-3 text-xs">{alert.summary}</td>
                  </tr>
                ))}
                {(summary?.recommendedAlerts?.alerts ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-sm text-kode01-noir/50">
                      {t('recommended_alerts.empty')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-black/5 bg-kode01-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('endpoint_health_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-black/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
                  <th className="px-3 py-3">{t('table.endpoint')}</th>
                  <th className="px-3 py-3">{t('table.health')}</th>
                  <th className="px-3 py-3">{t('table.calls')}</th>
                  <th className="px-3 py-3">{t('table.error_rate')}</th>
                  <th className="px-3 py-3">{t('table.p95')}</th>
                  <th className="px-3 py-3">{t('table.last_success')}</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.endpoints ?? []).map((endpoint) => (
                  <tr key={endpoint.endpoint} className="border-b border-black/5">
                    <td className="px-3 py-3 font-mono text-xs">{endpoint.endpoint}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${healthBadgeClass(endpoint.healthStatus)}`}
                      >
                        {t(`statuses.health.${endpoint.healthStatus}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">{endpoint.totalCalls}</td>
                    <td className="px-3 py-3 text-xs">{Number(endpoint.errorRatePercent).toFixed(2)}%</td>
                    <td className="px-3 py-3 text-xs">{endpoint.p95LatencyMs}ms</td>
                    <td className="px-3 py-3 text-xs">{formatDateTime(endpoint.lastSuccessAt, locale)}</td>
                  </tr>
                ))}
                {(summary?.endpoints ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-sm text-kode01-noir/50">
                      {t('empty_endpoints')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[32px] border-black/5 bg-kode01-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('deliveries_title')}
          </CardTitle>
          <select
            value={deliveryStatus}
            onChange={(event) => {
              void setQuery({
                deliveryStatus: event.target.value === 'all'
                  ? null
                  : event.target.value as DeliveryStatusFilter,
              });
            }}
            className="h-10 rounded-2xl border border-black/10 px-3 text-xs font-semibold"
          >
            <option value="all">{t('filters.deliveries_all')}</option>
            <option value="failed">{t('filters.deliveries_failed')}</option>
            <option value="retrying">{t('filters.deliveries_retrying')}</option>
          </select>
        </CardHeader>
        <CardContent>
          {deliveriesError ? <p className="text-sm font-semibold text-red-600">{deliveriesError}</p> : null}
          <div className="overflow-x-auto rounded-2xl border border-black/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
                  <th className="px-3 py-3">{t('deliveries_table.updated')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.event')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.status')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.attempts')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.endpoint')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.error')}</th>
                  <th className="px-3 py-3">{t('deliveries_table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((row) => (
                  <tr key={row.id} className="border-b border-black/5 align-top">
                    <td className="px-3 py-3 text-xs">{formatDateTime(row.updated_at, locale)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.event_type}</td>
                    <td className="px-3 py-3 text-xs uppercase">{t(`statuses.delivery.${row.status}`)}</td>
                    <td className="px-3 py-3 text-xs">{row.attempt_count}/{row.max_attempts}</td>
                    <td className="px-3 py-3 text-xs">{row.endpoint_url}</td>
                    <td className="px-3 py-3 text-xs">{row.last_error ?? t('states.not_available')}</td>
                    <td className="px-3 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retryingId === row.id || row.status === 'sent'}
                        onClick={() => void handleRetry(row.id)}
                        className="rounded-full text-xs font-bold uppercase tracking-widest"
                      >
                        {retryingId === row.id ? t('retrying') : t('retry')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {deliveries.length === 0 && !deliveriesLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-sm text-kode01-noir/50">
                      {t('empty_deliveries')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
