'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  AdminUserListItem,
  AdminUsersListResponse,
} from '@/features/admin/users/types';
import {
  parseAsEnumParam,
  parseAsIntParam,
  parseAsStringParam,
  replaceHistoryOptions,
} from '@/lib/url-query/parsers';

type Props = {
  locale: string;
};

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const defaultFilters = {
  page: 1,
  pageSize: 25,
  q: '',
  role: 'all',
  plan: 'all',
  status: 'all',
};

const ROLE_FILTER_VALUES = ['all', 'buyer', 'seller', 'admin'] as const;
const PLAN_FILTER_VALUES = ['all', 'free', 'pro'] as const;
const STATUS_FILTER_VALUES = ['all', 'active', 'blocked'] as const;

const adminUsersFilterParsers = {
  page: parseAsIntParam(defaultFilters.page),
  pageSize: parseAsIntParam(defaultFilters.pageSize),
  q: parseAsStringParam(defaultFilters.q),
  role: parseAsEnumParam(ROLE_FILTER_VALUES, 'all'),
  plan: parseAsEnumParam(PLAN_FILTER_VALUES, 'all'),
  status: parseAsEnumParam(STATUS_FILTER_VALUES, 'all'),
};

type BlockFormState = {
  durationMode: 'preset' | 'custom';
  preset: '24h' | '7d' | '30d';
  customUntil: string;
  reason: string;
};

const defaultBlockFormState: BlockFormState = {
  durationMode: 'preset',
  preset: '24h',
  customUntil: '',
  reason: '',
};

function getStatusToneClass(isBlocked: boolean): string {
  return isBlocked
    ? 'bg-red-100 text-red-700 border-red-300'
    : 'bg-kode01-green/10 text-kode01-green border-kode01-green/20';
}

export function AdminUsersPanel({ locale }: Props) {
  const t = useTranslations('dashboard.admin.users');
  const [filters, setFilters] = useQueryStates(
    adminUsersFilterParsers,
    replaceHistoryOptions,
  );
  const [searchInput, setSearchInput] = useState(filters.q);
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    totalUsers: 0,
    activeUsers: 0,
    blockedUsers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormState>(defaultBlockFormState);
  const [blockFormError, setBlockFormError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / filters.pageSize)),
    [total, filters.pageSize],
  );

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
        q: filters.q,
        role: filters.role,
        plan: filters.plan,
        status: filters.status,
      });
      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as AdminUsersListResponse | { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload && 'error' in payload ? payload.error ?? t('messages.load_failed') : t('messages.load_failed'));
        setRows([]);
        setTotal(0);
        setSummary({ totalUsers: 0, activeUsers: 0, blockedUsers: 0 });
        return;
      }

      const successPayload = payload as AdminUsersListResponse | null;
      setRows(Array.isArray(successPayload?.data) ? successPayload.data : []);
      setTotal(typeof successPayload?.total === 'number' ? successPayload.total : 0);
      setSummary(
        successPayload?.summary ?? {
          totalUsers: 0,
          activeUsers: 0,
          blockedUsers: 0,
        },
      );
    } catch (error) {
      console.error('Failed to load admin users:', error);
      setErrorMessage(t('messages.load_failed'));
      setRows([]);
      setTotal(0);
      setSummary({ totalUsers: 0, activeUsers: 0, blockedUsers: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  function openBlockDialog(user: AdminUserListItem) {
    setSelectedUser(user);
    setBlockForm(defaultBlockFormState);
    setBlockFormError(null);
    setBlockDialogOpen(true);
  }

  function closeBlockDialog() {
    setBlockDialogOpen(false);
    setSelectedUser(null);
    setBlockForm(defaultBlockFormState);
    setBlockFormError(null);
  }

  async function submitBlockForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;

    setActionUserId(selectedUser.id);
    setBlockFormError(null);
    setStatusMessage(null);

    try {
      const payload: {
        durationMode: 'preset' | 'custom';
        preset?: '24h' | '7d' | '30d';
        customUntil?: string;
        reason: string;
      } = {
        durationMode: blockForm.durationMode,
        reason: blockForm.reason.trim(),
      };

      if (blockForm.durationMode === 'preset') {
        payload.preset = blockForm.preset;
      } else {
        if (!blockForm.customUntil) {
          setBlockFormError(t('messages.custom_date_required'));
          return;
        }
        const parsedDate = new Date(blockForm.customUntil);
        if (Number.isNaN(parsedDate.getTime())) {
          setBlockFormError(t('messages.custom_date_invalid'));
          return;
        }
        payload.customUntil = parsedDate.toISOString();
      }

      const response = await fetch(`/api/admin/users/${selectedUser.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setBlockFormError(result?.error ?? t('messages.block_failed'));
        return;
      }

      closeBlockDialog();
      setStatusMessage(t('messages.block_success'));
      await fetchUsers();
    } catch (error) {
      console.error('Block user failed:', error);
      setBlockFormError(t('messages.block_failed'));
    } finally {
      setActionUserId(null);
    }
  }

  async function unblockUser(user: AdminUserListItem) {
    setActionUserId(user.id);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/unblock`, {
        method: 'POST',
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(result?.error ?? t('messages.unblock_failed'));
        return;
      }

      setStatusMessage(t('messages.unblock_success'));
      await fetchUsers();
    } catch (error) {
      console.error('Unblock user failed:', error);
      setErrorMessage(t('messages.unblock_failed'));
    } finally {
      setActionUserId(null);
    }
  }

  function onSubmitSearch(event: FormEvent<HTMLFormElement>) {
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
      role: null,
      plan: null,
      status: null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.total_users')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-kode01-noir">
            {summary.totalUsers.toLocaleString(locale)}
          </CardContent>
        </Card>
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.active_users')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-kode01-green">
            {summary.activeUsers.toLocaleString(locale)}
          </CardContent>
        </Card>
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('kpis.blocked_users')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-3xl font-serif font-black text-red-600">
            {summary.blockedUsers.toLocaleString(locale)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir flex items-center gap-2">
            <Users size={20} />
            {t('table.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmitSearch} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('filters.search_placeholder')}
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm xl:col-span-2"
            />
            <select
              value={filters.role}
              onChange={(event) => {
                const next = event.target.value as (typeof ROLE_FILTER_VALUES)[number];
                void setFilters({
                  page: 1,
                  role: next === 'all' ? null : next,
                });
              }}
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.role_all')}</option>
              <option value="buyer">{t('filters.role_buyer')}</option>
              <option value="seller">{t('filters.role_seller')}</option>
              <option value="admin">{t('filters.role_admin')}</option>
            </select>
            <select
              value={filters.plan}
              onChange={(event) => {
                const next = event.target.value as (typeof PLAN_FILTER_VALUES)[number];
                void setFilters({
                  page: 1,
                  plan: next === 'all' ? null : next,
                });
              }}
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.plan_all')}</option>
              <option value="free">{t('filters.plan_free')}</option>
              <option value="pro">{t('filters.plan_pro')}</option>
            </select>
            <select
              value={filters.status}
              onChange={(event) => {
                const next = event.target.value as (typeof STATUS_FILTER_VALUES)[number];
                void setFilters({
                  page: 1,
                  status: next === 'all' ? null : next,
                });
              }}
              className="h-11 rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
            >
              <option value="all">{t('filters.status_all')}</option>
              <option value="active">{t('filters.status_active')}</option>
              <option value="blocked">{t('filters.status_blocked')}</option>
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

          {statusMessage && (
            <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-green">
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="overflow-x-auto rounded-3xl border border-kode01-sauge/20">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-kode01-sauge/20 bg-kode01-sauge/5">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">
                  <th className="px-4 py-3">{t('table.user')}</th>
                  <th className="px-4 py-3">{t('table.profile_type')}</th>
                  <th className="px-4 py-3">{t('table.subscription_type')}</th>
                  <th className="px-4 py-3">{t('table.joined_at')}</th>
                  <th className="px-4 py-3">{t('table.last_sign_in')}</th>
                  <th className="px-4 py-3">{t('table.status')}</th>
                  <th className="px-4 py-3 text-right">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="border-b border-kode01-sauge/10">
                      <td className="px-4 py-4 text-kode01-noir/30" colSpan={7}>
                        <Loader2 size={14} className="inline mr-2 animate-spin" />
                        {t('messages.loading')}
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-kode01-noir/50" colSpan={7}>
                      {t('messages.no_results')}
                    </td>
                  </tr>
                ) : (
                  rows.map((user) => {
                    const isActionBusy = actionUserId === user.id;
                    const canManage = user.role === 'buyer' || user.role === 'seller';
                    return (
                      <tr key={user.id} className="border-b border-kode01-sauge/10 align-top">
                        <td className="px-4 py-4">
                          <div className="font-bold text-kode01-noir">{user.displayName}</div>
                          <div className="text-xs text-kode01-noir/50">{user.email ?? '-'}</div>
                          <div className="text-[10px] font-mono text-kode01-noir/35 mt-1">{user.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                            {user.role === 'buyer'
                              ? t('filters.role_buyer')
                              : user.role === 'seller'
                                ? t('filters.role_seller')
                                : t('filters.role_admin')}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                            {user.planType === 'pro' ? t('filters.plan_pro') : t('filters.plan_free')}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-kode01-noir/70">{formatDateTime(user.createdAt, locale)}</td>
                        <td className="px-4 py-4 text-kode01-noir/70">{formatDateTime(user.lastSignInAt, locale)}</td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <Badge className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest border ${getStatusToneClass(user.isBlocked)}`}>
                              {user.isBlocked ? (
                                <span className="inline-flex items-center gap-1">
                                  <ShieldAlert size={12} />
                                  {t('status.blocked')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <ShieldCheck size={12} />
                                  {t('status.active')}
                                </span>
                              )}
                            </Badge>
                            {user.isBlocked && user.bannedUntil ? (
                              <div className="text-[10px] text-kode01-noir/45">
                                {t('status.blocked_until', { date: formatDateTime(user.bannedUntil, locale) })}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {canManage ? (
                            user.isBlocked ? (
                              <button
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => void unblockUser(user)}
                                className="inline-flex items-center rounded-full border border-kode01-green/30 bg-kode01-green/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-green disabled:opacity-50"
                              >
                                {isActionBusy ? (
                                  <Loader2 size={12} className="mr-1 animate-spin" />
                                ) : null}
                                {t('actions.unblock')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => openBlockDialog(user)}
                                className="inline-flex items-center rounded-full border border-red-300 bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700 disabled:opacity-50"
                              >
                                {isActionBusy ? (
                                  <Loader2 size={12} className="mr-1 animate-spin" />
                                ) : null}
                                {t('actions.block')}
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                              {t('actions.not_manageable')}
                            </span>
                          )}
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
                disabled={filters.page <= 1 || isLoading}
                onClick={() => {
                  void setFilters({ page: Math.max(1, filters.page - 1) });
                }}
                className="rounded-full border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {t('pagination.previous')}
              </button>
              <button
                type="button"
                disabled={filters.page >= totalPages || isLoading}
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

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>{t('block_dialog.title')}</DialogTitle>
            <DialogDescription>
              {selectedUser ? t('block_dialog.description', { user: selectedUser.displayName }) : ''}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitBlockForm} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                {t('block_dialog.reason_label')}
              </label>
              <input
                value={blockForm.reason}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder={t('block_dialog.reason_placeholder')}
                className="h-11 w-full rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                {t('block_dialog.duration_label')}
              </label>
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={blockForm.durationMode === 'preset'}
                    onChange={() => setBlockForm((prev) => ({ ...prev, durationMode: 'preset' }))}
                  />
                  {t('block_dialog.mode_preset')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    checked={blockForm.durationMode === 'custom'}
                    onChange={() => setBlockForm((prev) => ({ ...prev, durationMode: 'custom' }))}
                  />
                  {t('block_dialog.mode_custom')}
                </label>
              </div>
            </div>

            {blockForm.durationMode === 'preset' ? (
              <div className="grid grid-cols-3 gap-2">
                {(['24h', '7d', '30d'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBlockForm((prev) => ({ ...prev, preset: value }))}
                    className={`h-10 rounded-2xl border text-xs font-bold uppercase tracking-widest ${
                      blockForm.preset === value
                        ? 'border-kode01-pink bg-kode01-pink/10 text-kode01-noir'
                        : 'border-kode01-sauge/30 text-kode01-noir/70'
                    }`}
                  >
                    {value === '24h'
                      ? t('block_dialog.preset_24h')
                      : value === '7d'
                        ? t('block_dialog.preset_7d')
                        : t('block_dialog.preset_30d')}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                  {t('block_dialog.custom_until_label')}
                </label>
                <input
                  type="datetime-local"
                  value={blockForm.customUntil}
                  onChange={(event) => setBlockForm((prev) => ({ ...prev, customUntil: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-kode01-sauge/30 px-4 text-sm"
                />
              </div>
            )}

            {blockFormError ? (
              <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {blockFormError}
              </div>
            ) : null}

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={closeBlockDialog}
                className="h-10 rounded-2xl border border-kode01-sauge/30 px-4 text-xs font-bold uppercase tracking-widest text-kode01-noir/70"
              >
                {t('block_dialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={Boolean(actionUserId)}
                className="inline-flex h-10 items-center rounded-2xl bg-red-600 px-4 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
              >
                {actionUserId ? <Loader2 size={12} className="mr-2 animate-spin" /> : null}
                {t('block_dialog.confirm')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
