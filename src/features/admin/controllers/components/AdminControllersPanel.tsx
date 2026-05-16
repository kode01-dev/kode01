'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseAsEnumParam, parseAsStringParam, replaceHistoryOptions } from '@/lib/url-query/parsers';

type TemplateRow = {
  key: string;
  name: string;
  description: string | null;
  subject_en: string;
  subject_fr: string;
  message_en: string;
  message_fr: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  is_active: boolean;
};

type HistoryRow = {
  id: string;
  user_id: string;
  template_key: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  email_status: 'pending' | 'sent' | 'failed' | 'skipped';
  email_error: string | null;
  created_at: string;
  profile: {
    display_name: string | null;
    slug: string | null;
  } | null;
};

const EMPTY_SEND_FORM = {
  recipientUserId: '',
  templateKey: 'manual_admin_message',
  locale: 'en',
  title: '',
  message: '',
  link: '',
  emailEnabled: true,
};

const HISTORY_STATUS_FILTER_VALUES = ['all', 'pending', 'sent', 'failed', 'skipped'] as const;
const controllerHistoryFilterParsers = {
  status: parseAsEnumParam(HISTORY_STATUS_FILTER_VALUES, 'all'),
  template: parseAsStringParam('all'),
};

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AdminControllersPanel() {
  const t = useTranslations('dashboard.admin.controllers');
  const locale = useMemo(() => (typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr-CA' : 'en-CA'), []);
  const [historyFilters, setHistoryFilters] = useQueryStates(
    controllerHistoryFilterParsers,
    replaceHistoryOptions,
  );
  const selectedStatus = historyFilters.status;
  const selectedTemplate = historyFilters.template;

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [sendForm, setSendForm] = useState(EMPTY_SEND_FORM);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch('/api/admin/controllers/templates', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(t('errors.templates_load_failed'));
      const payload = (await response.json()) as { templates?: TemplateRow[] };
      setTemplates(payload.templates ?? []);
    } catch (loadError) {
      console.error(loadError);
      setError(t('errors.templates_load_failed'));
    } finally {
      setLoadingTemplates(false);
    }
  }, [t]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (selectedTemplate !== 'all') params.set('template', selectedTemplate);

      const response = await fetch(`/api/admin/controllers/notifications?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) throw new Error(t('errors.history_load_failed'));
      const payload = (await response.json()) as { notifications?: HistoryRow[] };
      setHistory(payload.notifications ?? []);
    } catch (loadError) {
      console.error(loadError);
      setError(t('errors.history_load_failed'));
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedStatus, selectedTemplate, t]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSendNow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSending(true);

    try {
      const response = await fetch('/api/admin/controllers/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipientUserId: sendForm.recipientUserId.trim(),
          templateKey: sendForm.templateKey,
          locale: sendForm.locale,
          title: sendForm.title.trim() || undefined,
          message: sendForm.message.trim() || undefined,
          link: sendForm.link.trim() || undefined,
          email: { enabled: sendForm.emailEnabled },
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.send_failed'));
      }

      setMessage(t('send.success'));
      setSendForm((prev) => ({
        ...prev,
        recipientUserId: '',
        title: '',
        message: '',
        link: '',
      }));
      await loadHistory();
    } catch (sendError) {
      console.error(sendError);
      setError(sendError instanceof Error ? sendError.message : t('errors.send_failed'));
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTemplate(template: TemplateRow) {
    setSavingTemplate(template.key);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/controllers/templates/${template.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          subjectEn: template.subject_en,
          subjectFr: template.subject_fr,
          messageEn: template.message_en,
          messageFr: template.message_fr,
          emailEnabled: template.email_enabled,
          inAppEnabled: template.in_app_enabled,
          pushEnabled: template.push_enabled,
          isActive: template.is_active,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.template_save_failed'));
      }

      setMessage(t('templates.saved'));
      await loadTemplates();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : t('errors.template_save_failed'));
    } finally {
      setSavingTemplate(null);
    }
  }

  async function handleRetry(notificationId: string) {
    setRetryingId(notificationId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/controllers/notifications/${notificationId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? t('errors.retry_failed'));
      }

      setMessage(t('history.retry_success'));
      await loadHistory();
    } catch (retryError) {
      console.error(retryError);
      setError(retryError instanceof Error ? retryError.message : t('errors.retry_failed'));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-noir">
          {message}
        </div>
      ) : null}

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('send.title')}
          </CardTitle>
          <p className="text-[11px] uppercase tracking-widest text-kode01-noir/50 font-bold">
            {t('send.subtitle')}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendNow} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              placeholder={t('send.recipient_placeholder')}
              value={sendForm.recipientUserId}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  recipientUserId: event.target.value,
                }))
              }
              required
            />
            <select
              className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
              value={sendForm.templateKey}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  templateKey: event.target.value,
                }))
              }
            >
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.key}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
              value={sendForm.locale}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  locale: event.target.value,
                }))
              }
            >
              <option value="en">en</option>
              <option value="fr">fr</option>
            </select>
            <Input
              placeholder={t('send.link_placeholder')}
              value={sendForm.link}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  link: event.target.value,
                }))
              }
            />
            <Input
              placeholder={t('send.title_placeholder')}
              className="md:col-span-2"
              value={sendForm.title}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
            <textarea
              className="min-h-24 rounded-md border border-black/10 bg-white px-3 py-2 text-sm md:col-span-2"
              placeholder={t('send.message_placeholder')}
              value={sendForm.message}
              onChange={(event) =>
                setSendForm((prev) => ({
                  ...prev,
                  message: event.target.value,
                }))
              }
            />
            <label className="inline-flex items-center gap-2 text-sm text-kode01-noir/70">
              <input
                type="checkbox"
                checked={sendForm.emailEnabled}
                onChange={(event) =>
                  setSendForm((prev) => ({
                    ...prev,
                    emailEnabled: event.target.checked,
                  }))
                }
              />
              {t('send.email_enabled')}
            </label>

            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={sending}
                className="rounded-full bg-kode01-noir text-kode01-white text-[11px] uppercase tracking-widest"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    {t('send.sending')}
                  </>
                ) : (
                  <>
                    <Send size={14} className="mr-2" />
                    {t('send.cta')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('templates.title')}
          </CardTitle>
          <p className="text-[11px] uppercase tracking-widest text-kode01-noir/50 font-bold">
            {t('templates.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTemplates ? (
            <div className="text-sm text-kode01-noir/60 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {t('templates.loading')}
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.key} className="rounded-2xl border border-black/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                    {template.key}
                  </span>
                  <label className="inline-flex items-center gap-1 text-xs text-kode01-noir/70">
                    <input
                      type="checkbox"
                      checked={template.is_active}
                      onChange={(event) =>
                        setTemplates((prev) =>
                          prev.map((item) =>
                            item.key === template.key ? { ...item, is_active: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                    {t('templates.active')}
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-kode01-noir/70">
                    <input
                      type="checkbox"
                      checked={template.email_enabled}
                      onChange={(event) =>
                        setTemplates((prev) =>
                          prev.map((item) =>
                            item.key === template.key
                              ? { ...item, email_enabled: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    {t('templates.email_enabled')}
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-kode01-noir/70">
                    <input
                      type="checkbox"
                      checked={template.in_app_enabled}
                      onChange={(event) =>
                        setTemplates((prev) =>
                          prev.map((item) =>
                            item.key === template.key
                              ? { ...item, in_app_enabled: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    {t('templates.in_app_enabled')}
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-kode01-noir/70">
                    <input
                      type="checkbox"
                      checked={template.push_enabled}
                      onChange={(event) =>
                        setTemplates((prev) =>
                          prev.map((item) =>
                            item.key === template.key
                              ? { ...item, push_enabled: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    {t('templates.push_enabled')}
                  </label>
                </div>

                <Input
                  value={template.name}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  value={template.description ?? ''}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, description: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={t('templates.description_placeholder')}
                />
                <Input
                  value={template.subject_en}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, subject_en: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={t('templates.subject_en')}
                />
                <Input
                  value={template.subject_fr}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, subject_fr: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={t('templates.subject_fr')}
                />
                <textarea
                  className="min-h-20 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                  value={template.message_en}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, message_en: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={t('templates.message_en')}
                />
                <textarea
                  className="min-h-20 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
                  value={template.message_fr}
                  onChange={(event) =>
                    setTemplates((prev) =>
                      prev.map((item) =>
                        item.key === template.key ? { ...item, message_fr: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={t('templates.message_fr')}
                />

                <Button
                  type="button"
                  className="rounded-full bg-kode01-noir text-kode01-white text-[11px] uppercase tracking-widest"
                  disabled={savingTemplate === template.key}
                  onClick={() => void handleSaveTemplate(template)}
                >
                  {savingTemplate === template.key ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      {t('templates.saving')}
                    </>
                  ) : (
                    t('templates.save')
                  )}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('history.title')}
          </CardTitle>
          <p className="text-[11px] uppercase tracking-widest text-kode01-noir/50 font-bold">
            {t('history.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
              value={selectedStatus}
              onChange={(event) => {
                void setHistoryFilters({
                  status: event.target.value === 'all'
                    ? null
                    : event.target.value as (typeof HISTORY_STATUS_FILTER_VALUES)[number],
                });
              }}
            >
              <option value="all">{t('history.filters.all_statuses')}</option>
              <option value="pending">{t('history.status.pending')}</option>
              <option value="sent">{t('history.status.sent')}</option>
              <option value="failed">{t('history.status.failed')}</option>
              <option value="skipped">{t('history.status.skipped')}</option>
            </select>

            <select
              className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
              value={selectedTemplate}
              onChange={(event) => {
                void setHistoryFilters({
                  template: event.target.value === 'all' ? null : event.target.value,
                });
              }}
            >
              <option value="all">{t('history.filters.all_templates')}</option>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.key}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full text-[11px] uppercase tracking-widest"
              onClick={() => void loadHistory()}
              disabled={loadingHistory}
            >
              {loadingHistory ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  {t('history.refreshing')}
                </>
              ) : (
                <>
                  <RefreshCw size={14} className="mr-2" />
                  {t('history.refresh')}
                </>
              )}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/10">
            <table className="w-full text-left">
              <thead className="bg-kode01-sauge/10">
                <tr className="text-[10px] uppercase tracking-widest text-kode01-noir/50">
                  <th className="px-3 py-2">{t('history.table.date')}</th>
                  <th className="px-3 py-2">{t('history.table.user')}</th>
                  <th className="px-3 py-2">{t('history.table.template')}</th>
                  <th className="px-3 py-2">{t('history.table.title')}</th>
                  <th className="px-3 py-2">{t('history.table.email')}</th>
                  <th className="px-3 py-2 text-right">{t('history.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-kode01-noir/60" colSpan={6}>
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        {t('history.loading')}
                      </span>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-kode01-noir/60" colSpan={6}>
                      {t('history.empty')}
                    </td>
                  </tr>
                ) : (
                  history.map((row) => (
                    <tr key={row.id} className="border-t border-black/5 text-sm">
                      <td className="px-3 py-2">{formatDate(row.created_at, locale)}</td>
                      <td className="px-3 py-2">
                        {row.profile?.display_name || row.user_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">{row.template_key}</td>
                      <td className="px-3 py-2 max-w-[280px]">
                        <p className="truncate font-medium">{row.title}</p>
                        {row.message ? (
                          <p className="text-xs text-kode01-noir/50 truncate">{row.message}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full border border-black/10 px-2 py-0.5 text-xs uppercase">
                          {t(`history.status.${row.email_status}`)}
                        </span>
                        {row.email_error ? (
                          <p className="text-xs text-red-600 mt-1 max-w-[220px] truncate">{row.email_error}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.email_status === 'failed' ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-full bg-kode01-noir text-kode01-white text-[10px] uppercase tracking-widest"
                            disabled={retryingId === row.id}
                            onClick={() => void handleRetry(row.id)}
                          >
                            {retryingId === row.id ? (
                              <>
                                <Loader2 size={12} className="mr-1 animate-spin" />
                                {t('history.retrying')}
                              </>
                            ) : (
                              t('history.retry')
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-kode01-noir/40">{t('history.no_action')}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
