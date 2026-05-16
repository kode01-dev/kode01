'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EditorialMarkdown } from '@/features/editorial/lib/markdown';
import { slugifyTitle } from '@/features/editorial/lib/slug';
import type { EditorialLocale, EditorialStatus } from '@/features/editorial/types';
import {
  parseAsEnumParam,
  parseAsIntParam,
  parseAsStringParam,
  replaceHistoryOptions,
} from '@/lib/url-query/parsers';

type EditorialAdminPost = {
  id: string;
  translation_group_id: string;
  has_translation?: boolean;
  source_locale: EditorialLocale;
  locale: EditorialLocale;
  status: EditorialStatus;
  slug: string;
  category: string | null;
  title: string;
  excerpt: string | null;
  content_markdown?: string;
  cover_image_url: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  author_name: string | null;
  published_at: string | null;
  updated_at: string;
};

type Filters = {
  page: number;
  pageSize: number;
  q: string;
  locale: 'all' | EditorialLocale;
  status: 'all' | EditorialStatus;
};

type EditorMode = 'create_source' | 'create_translation' | 'edit';

type Props = { locale: string };

const baseFilters: Filters = { page: 1, pageSize: 20, q: '', locale: 'all', status: 'all' };
const EDITORIAL_LOCALE_FILTER_VALUES = ['all', 'en', 'fr'] as const;
const EDITORIAL_STATUS_FILTER_VALUES = ['all', 'draft', 'published'] as const;
const editorialAdminFilterParsers = {
  page: parseAsIntParam(baseFilters.page),
  pageSize: parseAsIntParam(baseFilters.pageSize),
  q: parseAsStringParam(baseFilters.q),
  locale: parseAsEnumParam(EDITORIAL_LOCALE_FILTER_VALUES, baseFilters.locale),
  status: parseAsEnumParam(EDITORIAL_STATUS_FILTER_VALUES, baseFilters.status),
};
const ACCEPTED_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const emptyEditor = {
  id: null as string | null,
  sourcePostId: null as string | null,
  source_locale: 'en' as EditorialLocale,
  locale: 'en' as EditorialLocale,
  status: 'draft' as EditorialStatus,
  published_at: '',
  slug: '',
  category: '',
  title: '',
  excerpt: '',
  content_markdown: '',
  cover_image_url: '',
  seo_title: '',
  seo_description: '',
  author_name: '',
};

function safeJson<T>(value: unknown): T | null {
  return value && typeof value === 'object' ? (value as T) : null;
}

function dt(value: string | null, locale: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function toDatetimeLocalValue(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function EditorialAdminPanel({ locale }: Props) {
  const t = useTranslations('dashboard.admin.editorial');
  const [filters, setFilters] = useQueryStates(
    editorialAdminFilterParsers,
    replaceHistoryOptions,
  );
  const [q, setQ] = useState(filters.q);
  const [rows, setRows] = useState<EditorialAdminPost[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('create_source');
  const [editor, setEditor] = useState({ ...emptyEditor });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [aiHelperCopied, setAiHelperCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EditorialAdminPost | null>(null);
  const mdRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setQ(filters.q);
  }, [filters.q]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / filters.pageSize)), [total, filters.pageSize]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const editableSlug = mode === 'create_source' || (mode === 'edit' && editor.locale === editor.source_locale);

  async function load(next = filters) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(next.page),
        pageSize: String(next.pageSize),
        q: next.q,
        locale: next.locale,
        status: next.status,
      });
      const res = await fetch(`/api/admin/editorial/posts?${params.toString()}`, { cache: 'no-store' });
      const body = safeJson<{ data?: EditorialAdminPost[]; total?: number; error?: string }>(await res.json().catch(() => null));
      if (!res.ok) {
        setError(body?.error ?? t('messages.load_failed'));
        setRows([]);
        setTotal(0);
        return;
      }
      const data = Array.isArray(body?.data) ? body.data : [];
      setRows(data);
      setTotal(typeof body?.total === 'number' ? body.total : data.length);
      if (selectedId && !data.some((item) => item.id === selectedId)) setSelectedId(null);

      const categoriesRes = await fetch('/api/admin/editorial/categories', { cache: 'no-store' });
      const categoriesBody = safeJson<{ data?: string[] }>(await categoriesRes.json().catch(() => null));
      if (categoriesRes.ok) {
        setCategories(Array.isArray(categoriesBody?.data) ? categoriesBody.data : []);
      }
    } catch {
      setError(t('messages.load_failed'));
      setRows([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function beginSource(locale: EditorialLocale) {
    setMode('create_source');
    setSelectedId(null);
    setEditor({ ...emptyEditor, locale, source_locale: locale });
    setStatus(null);
    setError(null);
  }

  function beginTranslation(source: EditorialAdminPost) {
    if (source.has_translation) return;
    const targetLocale: EditorialLocale = source.locale === 'en' ? 'fr' : 'en';
    setMode('create_translation');
    setSelectedId(source.id);
    setEditor({
      ...emptyEditor,
      sourcePostId: source.id,
      source_locale: source.source_locale,
      locale: targetLocale,
      published_at: toDatetimeLocalValue(source.published_at),
      slug: source.slug,
      category: source.category ?? '',
      cover_image_url: source.cover_image_url ?? '',
      author_name: source.author_name ?? '',
    });
    setStatus(null);
    setError(null);
  }

  function beginEdit(post: EditorialAdminPost) {
    setMode('edit');
    setSelectedId(post.id);
    setEditor({
      id: post.id,
      sourcePostId: null,
      source_locale: post.source_locale,
      locale: post.locale,
      status: post.status,
      published_at: toDatetimeLocalValue(post.published_at),
      slug: post.slug,
      category: post.category ?? '',
      title: post.title ?? '',
      excerpt: post.excerpt ?? '',
      content_markdown: post.content_markdown ?? '',
      cover_image_url: post.cover_image_url ?? '',
      seo_title: post.seo_title ?? '',
      seo_description: post.seo_description ?? '',
      author_name: post.author_name ?? '',
    });
    setStatus(null);
    setError(null);
  }

  function wrap(before: string, after = '') {
    const textarea = mdRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editor.content_markdown.slice(start, end) || t('editor.toolbar.placeholder_text');
    const insert = `${before}${selectedText}${after}`;
    setEditor((prev) => ({
      ...prev,
      content_markdown: `${prev.content_markdown.slice(0, start)}${insert}${prev.content_markdown.slice(end)}`,
    }));
  }

  async function copyAiHelper() {
    try {
      await navigator.clipboard.writeText(t('editor.ai_helper.content'));
      setAiHelperCopied(true);
      window.setTimeout(() => setAiHelperCopied(false), 1800);
    } catch {
      setError(t('messages.copy_failed'));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const slug = editableSlug ? (editor.slug.trim() || slugifyTitle(editor.title)) : editor.slug;
      const payload = {
        title: editor.title.trim(),
        slug,
        category: editor.category.trim() || null,
        excerpt: editor.excerpt.trim() || null,
        content_markdown: editor.content_markdown,
        cover_image_url: editor.cover_image_url.trim() || null,
        seo_title: editor.seo_title.trim() || null,
        seo_description: editor.seo_description.trim() || null,
        status: editor.status,
        published_at: editor.status === 'published' ? datetimeLocalToIso(editor.published_at) : null,
        author_name: editor.author_name.trim() || null,
      };
      const res =
        mode === 'edit' && editor.id
          ? await fetch(`/api/admin/editorial/posts/${editor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          : await fetch('/api/admin/editorial/posts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...payload,
                mode: mode === 'create_translation' ? 'create_translation' : 'create_source',
                locale: mode === 'create_source' ? editor.locale : undefined,
                sourcePostId: mode === 'create_translation' ? editor.sourcePostId ?? undefined : undefined,
              }),
            });
      const body = safeJson<{ error?: string; data?: EditorialAdminPost }>(await res.json().catch(() => null));
      if (!res.ok) {
        setError(body?.error ?? t('messages.save_failed'));
        return;
      }
      if (body?.data) beginEdit(body.data);
      setStatus(t('messages.save_success'));
      await load();
    } catch {
      setError(t('messages.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/editorial/posts/${deleteTarget.id}`, { method: 'DELETE' });
    const body = safeJson<{ error?: string }>(await res.json().catch(() => null));
    if (!res.ok) {
      setError(body?.error ?? t('messages.delete_failed'));
      return;
    }
    if (editor.id === deleteTarget.id) beginSource('en');
    setStatus(t('messages.delete_success'));
    await load();
  }

  async function toggle(post: EditorialAdminPost) {
    setError(null);
    setStatus(null);
    const next = post.status === 'published' ? 'draft' : 'published';
    const res = await fetch(`/api/admin/editorial/posts/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    const body = safeJson<{ error?: string }>(await res.json().catch(() => null));
    if (!res.ok) {
      setError(body?.error ?? t('messages.status_failed'));
      return;
    }
    setStatus(next === 'published' ? t('messages.published') : t('messages.unpublished'));
    if (editor.id === post.id) setEditor((prev) => ({ ...prev, status: next as EditorialStatus }));
    await load();
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setStatus(null);

    if (!ACCEPTED_UPLOAD_TYPES.has(file.type)) {
      setError('Unsupported image format. Use PNG, JPG, WEBP, GIF, or AVIF.');
      setUploading(false);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image is too large. Maximum size is 4 MB.');
      setUploading(false);
      return;
    }

    const form = new FormData();
    form.set('file', file);
    const res = await fetch('/api/admin/editorial/uploads', { method: 'POST', body: form });
    const raw = await res.text();
    const body = safeJson<{ error?: string; data?: { url?: string } }>((() => {
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })());
    if (!res.ok || !body?.data?.url) {
      const fallbackError =
        res.status === 413
          ? 'Image is too large for upload. Please use a file under 4 MB.'
          : res.status === 401 || res.status === 403
            ? 'Your session expired. Refresh the page and try again.'
            : `Upload failed (${res.status}).`;
      setError(body?.error ?? fallbackError ?? t('messages.upload_failed'));
      setUploading(false);
      return;
    }
    setEditor((prev) => ({ ...prev, cover_image_url: body.data?.url ?? '' }));
    setStatus(t('messages.upload_success'));
    setUploading(false);
  }

  return (
    <div className="space-y-6">
      {status && <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-green">{status}</div>}
      {error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="min-w-0 rounded-3xl border border-kode01-sauge/15 bg-white p-5">
          <h2 className="text-lg font-serif font-black">{mode === 'edit' ? t('editor.edit_title') : mode === 'create_translation' ? t('editor.create_translation_title') : t('editor.create_source_title')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={editor.locale.toUpperCase()} disabled className="h-10 rounded-xl border border-kode01-sauge/30 bg-kode01-sauge/5 px-3 text-sm" />
              <select value={editor.status} onChange={(e) => setEditor((p) => ({ ...p, status: e.target.value as EditorialStatus }))} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm">
                <option value="draft">{t('status.draft')}</option><option value="published">{t('status.published')}</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">{t('editor.publish_at')}</label>
              <input
                type="datetime-local"
                value={editor.published_at}
                onChange={(e) => setEditor((p) => ({ ...p, published_at: e.target.value }))}
                disabled={editor.status !== 'published'}
                className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm disabled:bg-kode01-sauge/5"
              />
            </div>
            <input value={editor.title} onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))} placeholder={t('editor.title')} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm" />
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">{t('editor.category')}</label>
              <input
                value={editor.category}
                onChange={(e) => setEditor((p) => ({ ...p, category: e.target.value }))}
                list="editorial-category-options"
                placeholder={t('editor.category_placeholder')}
                className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
              />
              <datalist id="editorial-category-options">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">{t('editor.author_name')}</label>
              <input
                value={editor.author_name}
                onChange={(e) => setEditor((p) => ({ ...p, author_name: e.target.value }))}
                placeholder={t('editor.author_name_placeholder')}
                className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <input value={editor.slug} onChange={(e) => setEditor((p) => ({ ...p, slug: e.target.value }))} disabled={!editableSlug} placeholder={t('editor.slug')} className="h-10 w-full rounded-xl border border-kode01-sauge/30 px-3 text-sm disabled:bg-kode01-sauge/5" />
              {editableSlug && <button type="button" onClick={() => setEditor((p) => ({ ...p, slug: slugifyTitle(p.title) }))} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-[10px] font-bold uppercase tracking-widest">{t('editor.auto_slug')}</button>}
            </div>
            <textarea value={editor.excerpt} onChange={(e) => setEditor((p) => ({ ...p, excerpt: e.target.value }))} rows={3} placeholder={t('editor.excerpt')} className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <input value={editor.cover_image_url} onChange={(e) => setEditor((p) => ({ ...p, cover_image_url: e.target.value }))} placeholder={t('editor.cover_image')} className="h-10 w-full rounded-xl border border-kode01-sauge/30 px-3 text-sm" />
              <label className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-kode01-sauge/30 px-3 text-[10px] font-bold uppercase tracking-widest">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{t('editor.upload')}
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              </label>
            </div>
            <input value={editor.seo_title} onChange={(e) => setEditor((p) => ({ ...p, seo_title: e.target.value }))} placeholder={t('editor.seo_title')} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm" />
            <input value={editor.seo_description} onChange={(e) => setEditor((p) => ({ ...p, seo_description: e.target.value }))} placeholder={t('editor.seo_description')} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm" />

            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => wrap('# ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">H1</button>
                <button type="button" onClick={() => wrap('## ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">H2</button>
                <button type="button" onClick={() => wrap('### ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">H3</button>
                <button type="button" onClick={() => wrap('**', '**')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">B</button>
                <button type="button" onClick={() => wrap('*', '*')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold italic">I</button>
                <button type="button" onClick={() => wrap('- ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">*</button>
                <button type="button" onClick={() => wrap('1. ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">1.</button>
                <button type="button" onClick={() => wrap('[', '](https://)')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">Link</button>
                <button type="button" onClick={() => wrap('> ')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">Quote</button>
                <button type="button" onClick={() => wrap('![alt text](', ')')} className="rounded-full border border-kode01-sauge/30 px-2 py-1 text-[10px] font-bold">Img</button>
                <button type="button" onClick={() => setShowPreview((p) => !p)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-kode01-sauge/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}{showPreview ? t('editor.hide_preview') : t('editor.show_preview')}
                </button>
              </div>
              <textarea ref={mdRef} value={editor.content_markdown} onChange={(e) => setEditor((p) => ({ ...p, content_markdown: e.target.value }))} rows={14} className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 font-mono text-sm" />
            </div>

            {showPreview && <div className="rounded-2xl border border-kode01-sauge/20 bg-kode01-cream/30 p-4"><EditorialMarkdown markdown={editor.content_markdown} /></div>}

            <div className="rounded-2xl border border-kode01-sauge/20 bg-kode01-cream/30 p-4">
              <h3 className="text-sm font-bold text-kode01-noir">{t('editor.ai_helper.title')}</h3>
              <p className="mt-1 text-xs text-kode01-noir/70">{t('editor.ai_helper.description')}</p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-kode01-sauge/20 bg-white p-3 font-mono text-xs text-kode01-noir/85">{t('editor.ai_helper.content')}</pre>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => void copyAiHelper()} className="rounded-xl border border-kode01-sauge/30 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest">
                  {aiHelperCopied ? t('editor.ai_helper.copied') : t('editor.ai_helper.copy')}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void save()} disabled={saving || !editor.title.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-kode01-noir px-4 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}{t('actions.save')}
              </button>
              <button type="button" onClick={() => beginSource('en')} className="rounded-2xl border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest">{t('actions.reset_editor')}</button>
              {mode === 'edit' && <p className="ml-auto text-xs text-kode01-noir/45">{t('editor.last_updated')}: {dt(selected?.updated_at ?? null, locale)}</p>}
            </div>

          </div>
        </section>

        <section className="min-w-0 rounded-3xl border border-kode01-sauge/15 bg-white p-5">
          <div className="mb-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => beginSource('en')} className="inline-flex items-center gap-2 rounded-2xl bg-kode01-noir px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
              <Plus size={14} />
              {t('actions.create_en')}
            </button>
            <button type="button" onClick={() => beginSource('fr')} className="rounded-2xl border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest">
              {t('actions.create_fr')}
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => beginTranslation(selected)}
                disabled={Boolean(selected.has_translation)}
                className="rounded-2xl border border-kode01-sauge/30 px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('actions.add_translation')}
              </button>
            )}
          </div>

          <h2 className="text-lg font-serif font-black">{t('list.title')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('list.search_placeholder')} className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm sm:col-span-2" />
            <select
              value={filters.locale}
              onChange={(e) => {
                void setFilters({
                  page: 1,
                  locale: e.target.value === 'all' ? null : e.target.value as (typeof EDITORIAL_LOCALE_FILTER_VALUES)[number],
                });
              }}
              className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
            >
              <option value="all">{t('list.locale_all')}</option><option value="en">EN</option><option value="fr">FR</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => {
                void setFilters({
                  page: 1,
                  status: e.target.value === 'all' ? null : e.target.value as (typeof EDITORIAL_STATUS_FILTER_VALUES)[number],
                });
              }}
              className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
            >
              <option value="all">{t('list.status_all')}</option><option value="draft">{t('status.draft')}</option><option value="published">{t('status.published')}</option>
            </select>
            <button
              type="button"
              onClick={() => {
                void setFilters({
                  page: 1,
                  q: q.trim() || null,
                });
              }}
              className="h-10 rounded-xl bg-kode01-noir px-3 text-xs font-bold uppercase tracking-widest text-white"
            >
              {t('list.apply')}
            </button>
            <button
              type="button"
              onClick={() => {
                setQ('');
                void setFilters({
                  page: null,
                  pageSize: null,
                  q: null,
                  locale: null,
                  status: null,
                });
              }}
              className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-xs font-bold uppercase tracking-widest"
            >
              {t('list.reset')}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {busy ? (
              <p className="text-sm text-kode01-noir/60"><Loader2 size={14} className="mr-2 inline animate-spin" />{t('messages.loading')}</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-kode01-noir/60">{t('messages.no_results')}</p>
            ) : rows.map((post) => (
              <div key={post.id} className={`rounded-2xl border p-3 ${selectedId === post.id ? 'border-kode01-pink bg-kode01-pink/5' : 'border-kode01-sauge/15'}`}>
                <button type="button" onClick={() => beginEdit(post)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold">{post.title}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {post.category && (
                        <span className="rounded-full border border-kode01-sauge/35 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-kode01-noir/60">{post.category}</span>
                      )}
                      {post.status === 'published' && post.published_at && new Date(post.published_at).getTime() > Date.now() && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">{t('status.scheduled')}</span>
                      )}
                      <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold uppercase">{post.locale}</span>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-kode01-noir/50">/{post.locale}/blog/{post.slug}</p>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void toggle(post)} className="rounded-full border border-kode01-sauge/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">{post.status === 'published' ? t('actions.unpublish') : t('actions.publish')}</button>
                  <button
                    type="button"
                    onClick={() => beginTranslation(post)}
                    disabled={Boolean(post.has_translation)}
                    className="rounded-full border border-kode01-sauge/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('actions.add_translation')}
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(post)} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700"><Trash2 size={12} />{t('actions.delete')}</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-kode01-noir/55">{t('list.page_of', { page: filters.page, totalPages: pages })}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() => {
                  void setFilters({ page: filters.page - 1 });
                }}
                className="rounded-full border border-kode01-sauge/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {t('list.previous')}
              </button>
              <button
                type="button"
                disabled={filters.page >= pages}
                onClick={() => {
                  void setFilters({ page: filters.page + 1 });
                }}
                className="rounded-full border border-kode01-sauge/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {t('list.next')}
              </button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="rounded-3xl border border-kode01-sauge/15 bg-white sm:max-w-md" showCloseButton={false}>
          <DialogHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <DialogTitle className="font-serif font-black text-kode01-noir">
              {t('messages.delete_dialog.title')}
            </DialogTitle>
            <DialogDescription className="text-sm text-kode01-noir/60">
              {t('messages.delete_dialog.description', { title: deleteTarget?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex gap-3 sm:justify-center">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-2xl border border-kode01-sauge/30 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-kode01-noir"
            >
              {t('messages.delete_dialog.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className="rounded-2xl bg-red-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-700"
            >
              {t('messages.delete_dialog.confirm')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
