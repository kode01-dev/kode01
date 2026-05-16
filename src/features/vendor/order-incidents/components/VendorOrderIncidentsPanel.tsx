'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type IncidentTimelineItem = {
  id: string;
  actionType: string;
  actorRole: 'buyer' | 'vendor' | 'admin' | 'system';
  createdAt: string;
  metadata: Record<string, unknown>;
};

type VendorIncident = {
  id: string;
  purchaseId: string;
  productId: string;
  issueType: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  slaDeadlineAt: string | null;
  evidenceUrls: string[];
  productTitle: string | null;
  buyerDisplayName: string | null;
  purchaseAmount: number | null;
  purchaseCurrency: string | null;
  purchaseStatus: string | null;
  timeline: IncidentTimelineItem[];
};

type DraftByIncident = Record<string, { message: string; proposedRefundMajor: string }>;

function formatDate(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale.startsWith('fr') ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: string) {
  if (status === 'open') return 'bg-red-100 text-red-700 border-red-300';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-700 border-amber-300';
  if (status === 'resolved') return 'bg-kode01-green/10 text-kode01-green border-kode01-green/30';
  return 'bg-kode01-sauge/10 text-kode01-noir/70 border-kode01-sauge/30';
}

export function VendorOrderIncidentsPanel({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.vendor.order_incidents');
  const [incidents, setIncidents] = useState<VendorIncident[]>([]);
  const [drafts, setDrafts] = useState<DraftByIncident>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const totalOpen = useMemo(
    () => incidents.filter((incident) => incident.status === 'open' || incident.status === 'in_progress').length,
    [incidents],
  );

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

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/vendor/order-incidents', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as
        | { incidents?: VendorIncident[]; error?: string }
        | null;
      if (!response.ok) {
        setIncidents([]);
        setErrorMessage(payload?.error ?? t('messages.load_failed'));
        return;
      }
      setIncidents(Array.isArray(payload?.incidents) ? payload.incidents : []);
    } catch (error) {
      console.error('Failed to load vendor incidents:', error);
      setIncidents([]);
      setErrorMessage(t('messages.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchIncidents();
  }, [fetchIncidents]);

  function updateDraft(incidentId: string, patch: Partial<{ message: string; proposedRefundMajor: string }>) {
    setDrafts((prev) => ({
      ...prev,
      [incidentId]: {
        message: prev[incidentId]?.message ?? '',
        proposedRefundMajor: prev[incidentId]?.proposedRefundMajor ?? '',
        ...patch,
      },
    }));
  }

  async function submitResponse(incident: VendorIncident) {
    const draft = drafts[incident.id] ?? { message: '', proposedRefundMajor: '' };
    const trimmedMessage = draft.message.trim();
    const normalizedAmount = draft.proposedRefundMajor.trim();
    const proposedRefundMajor = normalizedAmount ? Number(normalizedAmount) : null;
    const proposedRefundAmount =
      proposedRefundMajor !== null && Number.isFinite(proposedRefundMajor)
        ? Math.round(proposedRefundMajor * 100)
        : null;

    setBusyId(incident.id);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/vendor/order-incidents/${incident.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedMessage,
          proposedRefundAmount,
          locale,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.respond_failed'));
        return;
      }

      setStatusMessage(t('messages.respond_success'));
      setDrafts((prev) => ({
        ...prev,
        [incident.id]: { message: '', proposedRefundMajor: '' },
      }));
      await fetchIncidents();
    } catch (error) {
      console.error('Failed to respond to vendor incident:', error);
      setErrorMessage(t('messages.respond_failed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-8 border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
      <CardHeader className="border-b border-black/5">
        <CardTitle className="text-xl font-serif font-black text-kode01-noir">
          {t('title')} ({totalOpen})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
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

        {loading ? (
          <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-8 text-center text-sm text-kode01-noir/60">
            <Loader2 size={14} className="mr-2 inline animate-spin" />
            {t('messages.loading')}
          </div>
        ) : incidents.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-8 text-center">
            <p className="text-sm font-bold text-kode01-noir/70">{t('messages.no_incidents')}</p>
          </div>
        ) : (
          incidents.map((incident) => {
            const draft = drafts[incident.id] ?? { message: '', proposedRefundMajor: '' };
            const isBusy = busyId === incident.id;
            return (
              <div key={incident.id} className="rounded-2xl border border-kode01-sauge/20 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-kode01-noir">
                    {incident.productTitle || incident.productId.slice(0, 8)}
                  </p>
                  <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                    {t(`issue_types.${incident.issueType}`)}
                  </Badge>
                  <Badge className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${statusTone(incident.status)}`}>
                    {t(`statuses.${incident.status}`)}
                  </Badge>
                  {incident.resolution ? (
                    <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                      {t(`resolutions.${incident.resolution}`)}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-kode01-noir/60 sm:grid-cols-4">
                  <span>{t('meta.purchase')}: {incident.purchaseId.slice(0, 8)}</span>
                  <span>{t('meta.buyer')}: {incident.buyerDisplayName || '-'}</span>
                  <span>
                    {t('meta.amount')}:{' '}
                    {incident.purchaseAmount !== null
                      ? `${incident.purchaseCurrency?.toUpperCase() ?? 'USD'} ${incident.purchaseAmount.toFixed(2)}`
                      : '-'}
                  </span>
                  <span>{t('meta.sla')}: {formatDate(incident.slaDeadlineAt, locale)}</span>
                </div>

                {incident.evidenceUrls.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {incident.evidenceUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block h-16 w-16 overflow-hidden rounded-lg border border-black/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={t('evidence_alt')} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                      </a>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <textarea
                    value={draft.message}
                    onChange={(event) => updateDraft(incident.id, { message: event.target.value })}
                    placeholder={t('respond.message_placeholder')}
                    className="min-h-[90px] rounded-2xl border border-kode01-sauge/30 px-3 py-2 text-sm md:col-span-2"
                  />
                  <div className="space-y-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.proposedRefundMajor}
                      onChange={(event) => updateDraft(incident.id, { proposedRefundMajor: event.target.value })}
                      placeholder={t('respond.refund_placeholder')}
                      className="h-11 w-full rounded-2xl border border-kode01-sauge/30 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void submitResponse(incident)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-kode01-noir px-4 text-xs font-bold uppercase tracking-widest text-kode01-white disabled:opacity-60"
                    >
                      {isBusy ? <Loader2 size={12} className="mr-2 animate-spin" /> : null}
                      {t('respond.cta')}
                    </button>
                  </div>
                </div>

                {incident.timeline.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.02] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                      {t('timeline.title')}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {incident.timeline.slice(0, 6).map((action) => (
                        <div key={action.id} className="text-xs text-kode01-noir/65">
                          <span className="font-semibold">{getTimelineActorRoleLabel(action.actorRole)}</span>{' '}
                          {getTimelineActionLabel(action.actionType)}{' '}
                          <span className="text-kode01-noir/40">- {formatDate(action.createdAt, locale)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
