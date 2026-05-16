'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type SponsoredOrderStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type SponsoredReviewStatus = 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
type PublicationStatus = 'draft' | 'published';
type LocaleFilter = 'all' | 'en' | 'fr';

type SponsoredItem = {
  translation_group_id: string;
  source_locale: 'en' | 'fr';
  title: string;
  slug: string;
  status: PublicationStatus;
  sponsorship_status: SponsoredReviewStatus;
  locales: Array<'en' | 'fr'>;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejection_reason: string | null;
  order: {
    id: string;
    status: SponsoredOrderStatus;
    amount: number;
    currency: string;
    created_at: string;
    updated_at: string;
  } | null;
};

type SponsoredApiResponse = {
  data: SponsoredItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

const DEFAULT_PAGE_SIZE = 20;

export function CmsSponsoredPanel({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.admin.cms.sponsored');
  const [items, setItems] = useState<SponsoredItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [localeFilter, setLocaleFilter] = useState<LocaleFilter>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | SponsoredReviewStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | SponsoredOrderStatus>('all');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE)), [total]);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(DEFAULT_PAGE_SIZE),
        q,
        locale: localeFilter,
        sponsorshipStatus: reviewFilter,
        paymentStatus: paymentFilter,
        publicationStatus: 'all',
      });

      const res = await fetch(`/api/admin/editorial/sponsored?${params.toString()}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as SponsoredApiResponse | null;
      if (!res.ok) {
        setItems([]);
        setTotal(0);
        setError(body?.error ?? t('errors.load'));
        return;
      }

      setItems(Array.isArray(body?.data) ? body.data : []);
      setTotal(typeof body?.total === 'number' ? body.total : 0);
      setPage(typeof body?.page === 'number' ? body.page : nextPage);
    } catch {
      setError(t('errors.load'));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, localeFilter, reviewFilter, paymentFilter]);

  async function approve(translationGroupId: string) {
    setBusyId(translationGroupId);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/editorial/sponsored/${translationGroupId}/approve`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? t('errors.approve'));
        return;
      }
      setStatus(t('messages.approved'));
      await load(page);
    } catch {
      setError(t('errors.approve'));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(translationGroupId: string) {
    const reason = window.prompt(t('actions.reject_prompt'), '');
    if (!reason) return;

    setBusyId(translationGroupId);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/editorial/sponsored/${translationGroupId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? t('errors.reject'));
        return;
      }
      setStatus(t('messages.rejected'));
      await load(page);
    } catch {
      setError(t('errors.reject'));
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA');
  }

  return (
    <div className="space-y-6">
      {status && (
        <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-green">
          {status}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-kode01-sauge/15 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filters.search')}
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm lg:col-span-2"
          />
          <select
            value={localeFilter}
            onChange={(event) => setLocaleFilter(event.target.value as LocaleFilter)}
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          >
            <option value="all">{t('filters.locale_all')}</option>
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
          <select
            value={reviewFilter}
            onChange={(event) => setReviewFilter(event.target.value as 'all' | SponsoredReviewStatus)}
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          >
            <option value="all">{t('filters.review_all')}</option>
            <option value="pending_payment">{t('status.pending_payment')}</option>
            <option value="pending_review">{t('status.pending_review')}</option>
            <option value="approved">{t('status.approved')}</option>
            <option value="rejected">{t('status.rejected')}</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value as 'all' | SponsoredOrderStatus)}
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          >
            <option value="all">{t('filters.payment_all')}</option>
            <option value="pending">{t('payment.pending')}</option>
            <option value="paid">{t('payment.paid')}</option>
            <option value="failed">{t('payment.failed')}</option>
            <option value="refunded">{t('payment.refunded')}</option>
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            className="rounded-xl bg-kode01-noir text-xs font-bold uppercase tracking-widest text-white"
            onClick={() => {
              setPage(1);
              setQ(search.trim());
            }}
          >
            {t('actions.apply')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl text-xs font-bold uppercase tracking-widest"
            onClick={() => {
              setSearch('');
              setQ('');
              setLocaleFilter('all');
              setReviewFilter('all');
              setPaymentFilter('all');
              setPage(1);
            }}
          >
            {t('actions.reset')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ml-auto rounded-xl text-xs font-bold uppercase tracking-widest"
            onClick={() => void load(page)}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
            {t('actions.refresh')}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-kode01-sauge/15 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-kode01-sauge/15 bg-kode01-sauge/5">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.title')}</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.locales')}</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.review')}</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.publication')}</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.payment')}</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.submitted_at')}</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/55">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-sm text-kode01-noir/60">
                    <Loader2 size={14} className="mr-2 inline animate-spin" />
                    {t('loading')}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-sm text-kode01-noir/60">{t('empty')}</td>
                </tr>
              ) : (
                items.map((item) => {
                  const canReview = item.sponsorship_status === 'pending_review';
                  const isBusy = busyId === item.translation_group_id;
                  return (
                    <tr key={item.translation_group_id} className="border-b border-kode01-sauge/10 last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-bold text-kode01-noir">{item.title}</p>
                        <p className="text-xs text-kode01-noir/45">/{item.source_locale}/blog/{item.slug}</p>
                        {item.sponsored_rejection_reason && (
                          <p className="mt-1 text-xs text-red-700">{item.sponsored_rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 uppercase text-kode01-noir/65">{item.locales.join(', ')}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest">
                          {t(`status.${item.sponsorship_status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest">
                          {item.status === 'published' ? t('publication.published') : t('publication.draft')}
                        </span>
                        {item.published_at && (
                          <p className="mt-1 text-xs text-kode01-noir/45">{formatDate(item.published_at)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="rounded-full border border-black/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest inline-block">
                          {item.order ? t(`payment.${item.order.status}`) : t('payment.none')}
                        </p>
                        {item.order && (
                          <p className="mt-1 text-xs text-kode01-noir/45">
                            {Number(item.order.amount ?? 0).toFixed(2)} {item.order.currency.toUpperCase()}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-kode01-noir/55">
                        {formatDate(item.sponsored_submitted_at ?? item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-full bg-kode01-green/20 text-kode01-green hover:bg-kode01-green/30"
                            onClick={() => void approve(item.translation_group_id)}
                            disabled={!canReview || isBusy}
                          >
                            {isBusy ? <Loader2 size={14} className="animate-spin" /> : t('actions.approve')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => void reject(item.translation_group_id)}
                            disabled={!canReview || isBusy}
                          >
                            {t('actions.reject')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-kode01-noir/55">
          {t('pagination.page_of', { page, totalPages })}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={page <= 1 || loading}
            onClick={() => {
              const next = page - 1;
              setPage(next);
              void load(next);
            }}
          >
            {t('pagination.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={page >= totalPages || loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load(next);
            }}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
