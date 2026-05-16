'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AdminOrderIncidentFilters, AdminOrderIncidentListResponse } from '@/features/admin/order-incidents/types';
import type {
  AdminOrderIncidentListItem,
  OrderIncidentIssueType,
  OrderIncidentStatus,
} from '@/features/order-incidents/types';
import {
  parseAsEnumParam,
  parseAsIntParam,
  parseAsStringParam,
  replaceHistoryOptions,
} from '@/lib/url-query/parsers';

type Props = {
  locale: string;
};

const DEFAULT_FILTERS: AdminOrderIncidentFilters = {
  page: 1,
  pageSize: 20,
  q: '',
  status: 'all',
  issueType: 'all',
  decision: 'all',
};

const ISSUE_TYPE_OPTIONS: OrderIncidentIssueType[] = [
  'purchase_info_missing',
  'content_missing',
  'license_issue',
  'other',
];
const ISSUE_TYPE_FILTER_VALUES = ['all', ...ISSUE_TYPE_OPTIONS] as const;
const STATUS_FILTER_VALUES = ['all', 'open', 'in_progress', 'resolved', 'rejected'] as const;
const DECISION_FILTER_VALUES = ['all', 'confirmed', 'not_confirmed'] as const;

const adminOrderIncidentFilterParsers = {
  page: parseAsIntParam(DEFAULT_FILTERS.page),
  pageSize: parseAsIntParam(DEFAULT_FILTERS.pageSize),
  q: parseAsStringParam(DEFAULT_FILTERS.q),
  status: parseAsEnumParam(STATUS_FILTER_VALUES, 'all'),
  issueType: parseAsEnumParam(ISSUE_TYPE_FILTER_VALUES, 'all'),
  decision: parseAsEnumParam(DECISION_FILTER_VALUES, 'all'),
};

function formatDate(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale.startsWith('fr') ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: OrderIncidentStatus): string {
  if (status === 'open') return 'bg-red-100 text-red-700 border-red-300';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-700 border-amber-300';
  if (status === 'resolved') return 'bg-kode01-green/10 text-kode01-green border-kode01-green/20';
  return 'bg-kode01-sauge/10 text-kode01-noir/70 border-kode01-sauge/30';
}

export function AdminOrderIncidentsPanel({ locale }: Props) {
  const t = useTranslations('dashboard.admin.order_incidents');
  const [filters, setFilters] = useQueryStates(
    adminOrderIncidentFilterParsers,
    replaceHistoryOptions,
  );
  const [searchInput, setSearchInput] = useState(filters.q);
  const [rows, setRows] = useState<AdminOrderIncidentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, string>>({});
  const [createPurchaseId, setCreatePurchaseId] = useState('');
  const [createIssueType, setCreateIssueType] = useState<OrderIncidentIssueType>('purchase_info_missing');
  const [isCreating, setIsCreating] = useState(false);

  function getTimelineActionLabel(actionType: string) {
    try {
      return t(`timeline.actions.${actionType}` as never);
    } catch {
      return actionType;
    }
  }

  function getTimelineActorRoleLabel(actorRole: string) {
    try {
      return t(`timeline.actor_roles.${actorRole}` as never);
    } catch {
      return actorRole;
    }
  }

  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / filters.pageSize)),
    [total, filters.pageSize],
  );

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
        q: filters.q,
        status: filters.status,
        issueType: filters.issueType,
        decision: filters.decision,
      });

      const response = await fetch(`/api/admin/order-incidents?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        | AdminOrderIncidentListResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        setRows([]);
        setTotal(0);
        setSummary({
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          rejected: 0,
        });
        setErrorMessage(payload && 'error' in payload ? payload.error ?? t('messages.load_failed') : t('messages.load_failed'));
        return;
      }

      const data = payload as AdminOrderIncidentListResponse | null;
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(typeof data?.total === 'number' ? data.total : 0);
      setSummary(
        data?.summary ?? {
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          rejected: 0,
        },
      );
    } catch (error) {
      console.error('Failed to load order incidents:', error);
      setRows([]);
      setTotal(0);
      setSummary({
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        rejected: 0,
      });
      setErrorMessage(t('messages.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    void fetchIncidents();
  }, [fetchIncidents]);

  async function createIncident() {
    if (!createPurchaseId.trim()) return;
    setIsCreating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/admin/order-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId: createPurchaseId.trim(),
          issueType: createIssueType,
          locale,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.create_failed'));
        return;
      }

      setCreatePurchaseId('');
      setStatusMessage(t('messages.create_success'));
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to create incident:', error);
      setErrorMessage(t('messages.create_failed'));
    } finally {
      setIsCreating(false);
    }
  }

  async function patchIncident(incidentId: string, status: OrderIncidentStatus, decision: 'confirmed' | 'not_confirmed' | null) {
    setBusyId(incidentId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/order-incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          decision,
          locale,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.update_failed'));
        return;
      }

      setStatusMessage(t('messages.update_success'));
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to patch incident:', error);
      setErrorMessage(t('messages.update_failed'));
    } finally {
      setBusyId(null);
    }
  }

  async function runIncidentAction(
    incidentId: string,
    actionType: 'resend_purchase_confirmation' | 'send_access_notification',
  ) {
    setBusyId(incidentId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/order-incidents/${incidentId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType,
          locale,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.action_failed'));
        return;
      }

      setStatusMessage(t('messages.action_success'));
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to run incident action:', error);
      setErrorMessage(t('messages.action_failed'));
    } finally {
      setBusyId(null);
    }
  }

  async function refundIncident(incidentId: string) {
    setBusyId(incidentId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const majorValue = (refundDrafts[incidentId] ?? '').trim();
      const minorAmount = majorValue ? Math.round(Number(majorValue) * 100) : undefined;
      const body: { amount?: number; locale: string } = { locale };
      if (typeof minorAmount === 'number' && Number.isFinite(minorAmount) && minorAmount > 0) {
        body.amount = minorAmount;
      }

      const response = await fetch(`/api/admin/order-incidents/${incidentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.refund_failed'));
        return;
      }

      setStatusMessage(t('messages.refund_success'));
      setRefundDrafts((prev) => ({ ...prev, [incidentId]: '' }));
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to refund incident:', error);
      setErrorMessage(t('messages.refund_failed'));
    } finally {
      setBusyId(null);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void setFilters({
      page: 1,
      q: searchInput.trim() || null,
    });
  }

  function resetFilters() {
    setSearchInput('');
    void setFilters({
      page: null,
      pageSize: null,
      q: null,
      status: null,
      issueType: null,
      decision: null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.total')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-kode01-noir">
            {summary.total.toLocaleString(locale)}
          </CardContent>
        </Card>

        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.open')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-red-700">
            {summary.open.toLocaleString(locale)}
          </CardContent>
        </Card>

        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.in_progress')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-amber-700">
            {summary.inProgress.toLocaleString(locale)}
          </CardContent>
        </Card>

        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.resolved')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-kode01-green">
            {summary.resolved.toLocaleString(locale)}
          </CardContent>
        </Card>

        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.rejected')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-kode01-noir/70">
            {summary.rejected.toLocaleString(locale)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir flex items-center gap-2">
            <ShieldAlert size={20} />
            {t('create.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={createPurchaseId}
            onChange={(event) => setCreatePurchaseId(event.target.value)}
            placeholder={t('create.purchase_id')}
            className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm md:col-span-2"
          />
          <select
            value={createIssueType}
            onChange={(event) => setCreateIssueType(event.target.value as OrderIncidentIssueType)}
            className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
          >
            {ISSUE_TYPE_OPTIONS.map((issueType) => (
              <option key={issueType} value={issueType}>
                {t(`issue_types.${issueType}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isCreating}
            onClick={() => void createIncident()}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-kode01-noir px-4 text-xs font-bold uppercase tracking-widest text-kode01-white disabled:opacity-60"
          >
            {isCreating ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            {isCreating ? t('create.creating') : t('create.cta')}
          </button>
        </CardContent>
      </Card>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('table.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('filters.search_placeholder')}
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm xl:col-span-2"
            />
            <select
              value={filters.status}
              onChange={(event) =>
                void setFilters({
                  page: 1,
                  status: event.target.value === 'all'
                    ? null
                    : event.target.value as (typeof STATUS_FILTER_VALUES)[number],
                })
              }
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.status_all')}</option>
              <option value="open">{t('statuses.open')}</option>
              <option value="in_progress">{t('statuses.in_progress')}</option>
              <option value="resolved">{t('statuses.resolved')}</option>
              <option value="rejected">{t('statuses.rejected')}</option>
            </select>
            <select
              value={filters.issueType}
              onChange={(event) =>
                void setFilters({
                  page: 1,
                  issueType: event.target.value === 'all'
                    ? null
                    : event.target.value as (typeof ISSUE_TYPE_FILTER_VALUES)[number],
                })
              }
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.issue_type_all')}</option>
              {ISSUE_TYPE_OPTIONS.map((issueType) => (
                <option key={issueType} value={issueType}>
                  {t(`issue_types.${issueType}`)}
                </option>
              ))}
            </select>
            <select
              value={filters.decision}
              onChange={(event) =>
                void setFilters({
                  page: 1,
                  decision: event.target.value === 'all'
                    ? null
                    : event.target.value as (typeof DECISION_FILTER_VALUES)[number],
                })
              }
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.decision_all')}</option>
              <option value="confirmed">{t('decisions.confirmed')}</option>
              <option value="not_confirmed">{t('decisions.not_confirmed')}</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="h-11 rounded-2xl bg-kode01-noir px-4 text-xs font-bold uppercase tracking-widest text-kode01-white"
              >
                {t('filters.apply')}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-xs font-bold uppercase tracking-widest text-kode01-noir/70"
              >
                {t('filters.reset')}
              </button>
            </div>
          </form>

          {statusMessage ? (
            <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-noir">
              {statusMessage}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-3xl border border-kode01-sauge/20">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-kode01-sauge/20 bg-kode01-sauge/5">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  <th className="px-4 py-3">{t('table.incident')}</th>
                  <th className="px-4 py-3">{t('table.purchase')}</th>
                  <th className="px-4 py-3">{t('table.buyer')}</th>
                  <th className="px-4 py-3">{t('table.issue_type')}</th>
                  <th className="px-4 py-3">{t('table.status')}</th>
                  <th className="px-4 py-3">{t('table.decision')}</th>
                  <th className="px-4 py-3">{t('table.resolution')}</th>
                  <th className="px-4 py-3">{t('table.sla_deadline')}</th>
                  <th className="px-4 py-3">{t('table.updated_at')}</th>
                  <th className="px-4 py-3 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="border-b border-kode01-sauge/10">
                      <td className="px-4 py-4 text-kode01-noir/40" colSpan={10}>
                        <Loader2 size={14} className="inline mr-2 animate-spin" />
                        {t('messages.loading')}
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-kode01-noir/50" colSpan={10}>
                      {t('messages.no_results')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isBusy = busyId === row.id;
                    const displayBuyer = row.buyerDisplayName || row.buyerShopName || row.buyerId.slice(0, 8);
                    return (
                      <tr key={row.id} className="border-b border-kode01-sauge/10 align-top">
                        <td className="px-4 py-4">
                          <div className="font-bold text-kode01-noir">{row.id.slice(0, 8)}</div>
                          <div className="text-xs text-kode01-noir/50">{formatDate(row.createdAt, locale)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-mono text-xs text-kode01-noir/70">{row.purchaseId.slice(0, 8)}</div>
                          <div className="text-xs text-kode01-noir/50">
                            {row.productTitle || row.productId.slice(0, 8)}
                          </div>
                          {row.evidenceUrls.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.evidenceUrls.slice(0, 4).map((url) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block h-8 w-8 overflow-hidden rounded-md border border-black/10"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={t('table.evidence_alt')} className="h-full w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-kode01-noir">{displayBuyer}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                            {t(`issue_types.${row.issueType}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${statusTone(row.status)}`}>
                            {t(`statuses.${row.status}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-kode01-noir/70">
                          {row.decision ? t(`decisions.${row.decision}`) : t('decisions.none')}
                        </td>
                        <td className="px-4 py-4 text-kode01-noir/70">
                          {row.resolution ? t(`resolutions.${row.resolution}`) : t('resolutions.none')}
                        </td>
                        <td className="px-4 py-4 text-kode01-noir/70">
                          {formatDate(row.slaDeadlineAt, locale)}
                        </td>
                        <td className="px-4 py-4 text-kode01-noir/70">
                          {formatDate(row.updatedAt, locale)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void patchIncident(row.id, 'in_progress', null)}
                              className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 disabled:opacity-60"
                            >
                              {t('actions.set_in_progress')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void patchIncident(row.id, 'resolved', 'confirmed')}
                              className="rounded-full border border-kode01-green/30 bg-kode01-green/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-green disabled:opacity-60"
                            >
                              {t('actions.resolve_confirmed')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void patchIncident(row.id, 'rejected', 'not_confirmed')}
                              className="rounded-full border border-red-300 bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700 disabled:opacity-60"
                            >
                              {t('actions.reject_not_confirmed')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void runIncidentAction(row.id, 'resend_purchase_confirmation')}
                              className="rounded-full border border-kode01-blue/30 bg-kode01-blue/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-blue disabled:opacity-60"
                            >
                              {isBusy ? <Loader2 size={10} className="mr-1 inline animate-spin" /> : null}
                              {t('actions.resend_purchase_confirmation')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void runIncidentAction(row.id, 'send_access_notification')}
                              className="rounded-full border border-kode01-sauge/30 bg-kode01-sauge/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/70 disabled:opacity-60"
                            >
                              {t('actions.send_access_notification')}
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={refundDrafts[row.id] ?? ''}
                              onChange={(event) =>
                                setRefundDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                              }
                              placeholder={t('actions.refund_amount_placeholder')}
                              className="h-7 w-28 rounded-full border border-kode01-sauge/30 px-2 text-[10px]"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void refundIncident(row.id)}
                              className="rounded-full border border-kode01-blue/30 bg-kode01-blue/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-blue disabled:opacity-60"
                            >
                              {t('actions.refund_via_stripe')}
                            </button>
                          </div>
                          {row.timeline.length > 0 ? (
                            <div className="mt-2 max-w-md space-y-1 text-left">
                              {row.timeline.slice(0, 4).map((action) => (
                                <div key={action.id} className="text-[10px] text-kode01-noir/55">
                                  <span className="font-bold">{getTimelineActorRoleLabel(action.actorRole)}</span>{' '}
                                  {getTimelineActionLabel(action.actionType)}{' '}
                                  <span>- {formatDate(action.createdAt, locale)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {row.stripeRefundId ? (
                            <div className="mt-2 text-[10px] text-kode01-noir/50">
                              Stripe refund: {row.stripeRefundId}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold text-kode01-noir/50">
              {t('pagination.page_of', { page: filters.page, totalPages })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filters.page <= 1 || loading}
                onClick={() => {
                  void setFilters({ page: Math.max(1, filters.page - 1) });
                }}
                className="rounded-full border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {t('pagination.previous')}
              </button>
              <button
                type="button"
                disabled={filters.page >= totalPages || loading}
                onClick={() => {
                  void setFilters({ page: Math.min(totalPages, filters.page + 1) });
                }}
                className="rounded-full border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {t('pagination.next')}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
