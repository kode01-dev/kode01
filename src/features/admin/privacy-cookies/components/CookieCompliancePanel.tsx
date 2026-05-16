'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryStates } from 'nuqs';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { DashboardShellSkeleton } from '@/components/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CookieConsentSummaryRangeResponse } from '@/features/cookies/types';
import { parseAsEnumParam, replaceHistoryOptions } from '@/lib/url-query/parsers';

type SummaryRange = '24h' | '7d' | '30d';
type EventTypeFilter = 'all' | 'consent_first_choice' | 'consent_updated' | 'consent_withdrawn';
type SourceFilter = 'all' | 'banner' | 'preferences' | 'settings';

type ConsentEventRow = {
  id: string;
  user_id: string | null;
  anonymous_consent_id: string;
  event_type: 'consent_first_choice' | 'consent_updated' | 'consent_withdrawn';
  accepted_categories: string[];
  rejected_categories: string[];
  consent_version: string;
  source: 'banner' | 'preferences' | 'settings';
  locale: string | null;
  created_at: string;
};

type Props = {
  locale: string;
};

const SUMMARY_RANGE_VALUES = ['24h', '7d', '30d'] as const;
const EVENT_TYPE_VALUES = ['all', 'consent_first_choice', 'consent_updated', 'consent_withdrawn'] as const;
const SOURCE_VALUES = ['all', 'banner', 'preferences', 'settings'] as const;

const cookieComplianceFilterParsers = {
  range: parseAsEnumParam(SUMMARY_RANGE_VALUES, '7d'),
  eventType: parseAsEnumParam(EVENT_TYPE_VALUES, 'all'),
  source: parseAsEnumParam(SOURCE_VALUES, 'all'),
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function shortId(value: string | null): string {
  if (!value) return '-';
  return value.slice(0, 8);
}

function getEventLabel(
  eventType: ConsentEventRow['event_type'],
  t: (key: string) => string,
): string {
  if (eventType === 'consent_first_choice') return t('event_type.first_choice');
  if (eventType === 'consent_withdrawn') return t('event_type.withdrawn');
  return t('event_type.updated');
}

function getSourceLabel(
  source: ConsentEventRow['source'],
  t: (key: string) => string,
): string {
  if (source === 'banner') return t('source.banner');
  if (source === 'preferences') return t('source.preferences');
  return t('source.settings');
}

export function CookieCompliancePanel({ locale }: Props) {
  const t = useTranslations('dashboard.admin.cookies_panel');
  const [query, setQuery] = useQueryStates(
    cookieComplianceFilterParsers,
    replaceHistoryOptions,
  );
  const range = query.range;
  const eventType = query.eventType;
  const source = query.source;
  const [summary, setSummary] = useState<CookieConsentSummaryRangeResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<ConsentEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (nextRange: SummaryRange) => {
    setSummaryLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/privacy/cookies/summary?range=${nextRange}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? t('errors.summary_load_failed'));
        return;
      }
      setSummary(payload?.data ?? null);
    } catch (err) {
      console.error('Failed to load cookie summary:', err);
      setError(t('errors.summary_load_failed'));
    } finally {
      setSummaryLoading(false);
    }
  }, [t]);

  const fetchEvents = useCallback(
    async ({
      append,
      cursor,
      nextRange,
      nextEventType,
      nextSource,
    }: {
      append: boolean;
      cursor?: string | null;
      nextRange: SummaryRange;
      nextEventType: EventTypeFilter;
      nextSource: SourceFilter;
    }) => {
      setEventsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        range: nextRange,
        limit: '50',
      });

      if (cursor) params.set('cursor', cursor);
      if (nextEventType !== 'all') params.set('eventType', nextEventType);
      if (nextSource !== 'all') params.set('source', nextSource);

      try {
        const response = await fetch(`/api/admin/privacy/cookies/events?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setError(payload?.error ?? t('errors.events_load_failed'));
          return;
        }

        const rows = Array.isArray(payload?.data) ? (payload.data as ConsentEventRow[]) : [];
        setEvents((prev) => (append ? [...prev, ...rows] : rows));
        setNextCursor(typeof payload?.nextCursor === 'string' ? payload.nextCursor : null);
      } catch (err) {
        console.error('Failed to load cookie events:', err);
        setError(t('errors.events_load_failed'));
      } finally {
        setEventsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchSummary(range);
    void fetchEvents({
      append: false,
      nextRange: range,
      nextEventType: eventType,
      nextSource: source,
    });
  }, [range, eventType, source, fetchSummary, fetchEvents]);

  const cards = useMemo(() => {
    return [
      {
        key: 'consent-rate',
        title: t('cards.consent_rate'),
        value: formatPercent(summary?.kpis.consentRatePercent ?? 0),
      },
      {
        key: 'analytics',
        title: t('cards.analytics_accepted'),
        value: formatPercent(summary?.kpis.analyticsAcceptedPercent ?? 0),
      },
      {
        key: 'marketing',
        title: t('cards.marketing_accepted'),
        value: formatPercent(summary?.kpis.marketingAcceptedPercent ?? 0),
      },
      {
        key: 'opt-out',
        title: t('cards.withdraw_opt_out'),
        value: formatPercent(summary?.kpis.optOutPercent ?? 0),
      },
    ];
  }, [summary?.kpis, t]);

  if (summaryLoading && !summary && eventsLoading && events.length === 0) {
    return <DashboardShellSkeleton embedded cards={4} showCharts showTable />;
  }

  return (
    <div className="space-y-6">
      <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {t('title')}
            </CardTitle>
            <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <select
            value={range}
            onChange={(event) => {
              void setQuery({
                range: event.target.value === '7d'
                  ? null
                  : event.target.value as SummaryRange,
              });
            }}
            className="rounded-2xl border border-black/10 px-3 py-2 text-sm font-semibold"
          >
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <div key={card.key} className="rounded-2xl border border-black/10 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  {card.title}
                </p>
                <div className="mt-2 text-3xl font-serif font-black text-kode01-noir">
                  {summaryLoading ? (
                    <Skeleton variant="text" tone="cream" className="h-9 rounded-lg w-20" />
                  ) : (
                    card.value
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 h-72 rounded-2xl border border-black/10 p-3">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
              <LineChart data={summary?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="withdrawals"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="optionalAccepted"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('events.title')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eventType}
              onChange={(event) => {
                void setQuery({
                  eventType: event.target.value === 'all'
                    ? null
                    : event.target.value as EventTypeFilter,
                });
              }}
              className="rounded-2xl border border-black/10 px-3 py-2 text-xs font-semibold"
            >
              <option value="all">{t('filters.all_events')}</option>
              <option value="consent_first_choice">{t('event_type.first_choice')}</option>
              <option value="consent_updated">{t('event_type.updated')}</option>
              <option value="consent_withdrawn">{t('event_type.withdrawn')}</option>
            </select>
            <select
              value={source}
              onChange={(event) => {
                void setQuery({
                  source: event.target.value === 'all'
                    ? null
                    : event.target.value as SourceFilter,
                });
              }}
              className="rounded-2xl border border-black/10 px-3 py-2 text-xs font-semibold"
            >
              <option value="all">{t('filters.all_sources')}</option>
              <option value="banner">{t('source.banner')}</option>
              <option value="preferences">{t('source.preferences')}</option>
              <option value="settings">{t('source.settings')}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-black/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
                      <th className="py-3 px-3">{t('table.date')}</th>
                      <th className="py-3 px-3">{t('table.event')}</th>
                      <th className="py-3 px-3">{t('table.source')}</th>
                      <th className="py-3 px-3">{t('table.accepted')}</th>
                      <th className="py-3 px-3">{t('table.rejected')}</th>
                      <th className="py-3 px-3">{t('table.user')}</th>
                      <th className="py-3 px-3">{t('table.anon_id')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsLoading && events.length === 0
                      ? Array.from({ length: 5 }).map((_, index) => (
                        <tr key={`skeleton-${index}`} className="border-b border-black/5">
                          {Array.from({ length: 7 }).map((__, cellIndex) => (
                            <td key={cellIndex} className="py-3 px-3">
                              <Skeleton variant="text" tone="cream" className="h-3 rounded-full w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                      : events.map((row) => (
                        <tr key={row.id} className="border-b border-black/5">
                          <td className="py-3 px-3 text-xs">
                            {new Date(row.created_at).toLocaleString(locale)}
                          </td>
                          <td className="py-3 px-3 text-xs font-semibold">
                            {getEventLabel(row.event_type, t)}
                          </td>
                          <td className="py-3 px-3 text-xs">{getSourceLabel(row.source, t)}</td>
                          <td className="py-3 px-3 text-xs">{row.accepted_categories.join(', ') || '-'}</td>
                          <td className="py-3 px-3 text-xs">{row.rejected_categories.join(', ') || '-'}</td>
                          <td className="py-3 px-3 text-xs font-mono">{shortId(row.user_id)}</td>
                          <td className="py-3 px-3 text-xs font-mono">{shortId(row.anonymous_consent_id)}</td>
                        </tr>
                      ))}
                    {events.length === 0 && !eventsLoading ? (
                      <tr>
                        <td className="py-6 px-3 text-sm text-kode01-noir/50" colSpan={7}>
                          {t('events.empty')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void fetchEvents({
                      append: true,
                      cursor: nextCursor,
                      nextRange: range,
                      nextEventType: eventType,
                      nextSource: source,
                    })
                  }
                  disabled={!nextCursor || eventsLoading}
                  className="rounded-full border border-black/15 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                >
                  {eventsLoading ? t('actions.loading') : t('actions.load_more')}
                </button>
                <span className="text-xs font-semibold text-kode01-noir/50">
                  {t('events.count', { count: events.length })}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
