'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQueryStates } from 'nuqs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Loader2,
  Trash2,
  CheckCircle,
  XCircle,
  Edit,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  parseAsEnumParam,
  parseAsIntParam,
  parseAsStringParam,
  replaceHistoryOptions,
} from '@/lib/url-query/parsers';

interface Post {
  id: string;
  title: string;
  slug: string;
  locale: string;
  status: string;
  is_sponsored?: boolean;
  sponsorship_status?: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
  translation_group_id: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  hasTranslation?: boolean;
}

interface Filters {
  page: number;
  pageSize: number;
  q: string;
  locale: 'all' | 'en' | 'fr';
  status: 'all' | 'draft' | 'published';
}

const DEFAULT_FILTERS: Filters = {
  page: 1,
  pageSize: 20,
  q: '',
  locale: 'all',
  status: 'all',
};

const PUBLICATION_LOCALE_FILTER_VALUES = ['all', 'en', 'fr'] as const;
const PUBLICATION_STATUS_FILTER_VALUES = ['all', 'draft', 'published'] as const;

const cmsPublicationFilterParsers = {
  page: parseAsIntParam(DEFAULT_FILTERS.page),
  pageSize: parseAsIntParam(DEFAULT_FILTERS.pageSize),
  q: parseAsStringParam(DEFAULT_FILTERS.q),
  locale: parseAsEnumParam(PUBLICATION_LOCALE_FILTER_VALUES, DEFAULT_FILTERS.locale),
  status: parseAsEnumParam(PUBLICATION_STATUS_FILTER_VALUES, DEFAULT_FILTERS.status),
};

export function CmsPublicationsPanel({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.admin.cms.publications');
  const router = useRouter();
  const [filters, setFilters] = useQueryStates(
    cmsPublicationFilterParsers,
    replaceHistoryOptions,
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(filters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / filters.pageSize)),
    [total, filters.pageSize],
  );

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
      });
      if (filters.q) params.set('q', filters.q);
      if (filters.locale !== 'all') params.set('locale', filters.locale);
      if (filters.status !== 'all') params.set('status', filters.status);

      const res = await fetch(`/api/admin/editorial/posts?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPosts(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setError(t('fetch_error'));
    } finally {
      setIsLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelected(new Set());
    void setFilters({
      page: 1,
      q: searchInput.trim() || null,
    });
  };

  const handleFilterChange = (key: 'locale' | 'status', value: string) => {
    setSelected(new Set());
    if (key === 'locale') {
      void setFilters({
        page: 1,
        locale: value === 'all' ? null : value as (typeof PUBLICATION_LOCALE_FILTER_VALUES)[number],
      });
      return;
    }
    void setFilters({
      page: 1,
      status: value === 'all' ? null : value as (typeof PUBLICATION_STATUS_FILTER_VALUES)[number],
    });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSelected(new Set());
    void setFilters({
      page: null,
      pageSize: null,
      q: null,
      locale: null,
      status: null,
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  };

  const doBulkAction = async (action: 'publish' | 'unpublish' | 'delete', ids: string[]) => {
    setBulkLoading(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/editorial/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, postIds: ids }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setStatusMessage(t('bulk_success', { count: result.success }));
      setSelected(new Set());
      void fetchPosts();
    } catch {
      setStatusMessage(t('bulk_error'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = () => doBulkAction('publish', [...selected]);
  const handleBulkUnpublish = () => doBulkAction('unpublish', [...selected]);

  const handleBulkDelete = () => {
    setDeleteTarget([...selected]);
    setDeleteDialogOpen(true);
  };

  const handleSingleDelete = (id: string) => {
    setDeleteTarget([id]);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await doBulkAction('delete', deleteTarget);
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const handleDuplicate = async (post: Post) => {
    setBulkLoading(true);
    try {
      const res = await fetch('/api/admin/editorial/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create_source',
          locale: post.locale,
          title: `${post.title} (copy)`,
          slug: `${post.slug}-copy-${Date.now()}`,
          excerpt: post.excerpt ?? '',
          content_markdown: '',
          cover_image_url: post.cover_image_url,
          seo_title: post.seo_title,
          seo_description: post.seo_description,
          status: 'draft',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusMessage(t('duplicate_success'));
      void fetchPosts();
    } catch {
      setStatusMessage(t('duplicate_error'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExportCsv = () => {
    const rows = selected.size > 0 ? posts.filter((p) => selected.has(p.id)) : posts;
    const headers = ['id', 'title', 'slug', 'locale', 'status', 'published_at', 'created_at'];
    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const val = String(r[h as keyof Post] ?? '');
            return val.includes(',') || val.includes('"')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `editorial-posts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 rounded-2xl bg-black/5" />
        <Skeleton className="h-[500px] rounded-[32px] bg-black/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Message */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-2xl border border-kode01-green/20 bg-kode01-green/5 px-4 py-3 text-sm font-bold text-kode01-green">
          <CheckCircle size={16} />
          {statusMessage}
          <button
            className="ml-auto text-kode01-noir/30 hover:text-kode01-noir"
            onClick={() => setStatusMessage('')}
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <AlertCircle size={16} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchPosts()}
            className="rounded-full border-red-300 text-red-600 hover:bg-red-100"
          >
            <RefreshCw size={14} className="mr-1" />
            {t('retry')}
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card className="rounded-[32px] border-black/5 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className="rounded-full border-black/10 pl-10 font-bold text-kode01-noir placeholder:text-kode01-noir/30"
                />
              </div>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filters.locale}
                onChange={(e) => handleFilterChange('locale', e.target.value)}
                className="h-10 rounded-full border border-black/10 bg-white px-4 text-sm font-bold text-kode01-noir"
              >
                <option value="all">{t('filter_all_locales')}</option>
                <option value="en">EN</option>
                <option value="fr">FR</option>
              </select>

              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="h-10 rounded-full border border-black/10 bg-white px-4 text-sm font-bold text-kode01-noir"
              >
                <option value="all">{t('filter_all_status')}</option>
                <option value="published">{t('published')}</option>
                <option value="draft">{t('draft')}</option>
              </select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="rounded-full border-black/10 text-kode01-noir/60 hover:text-kode01-noir"
              >
                {t('reset')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-kode01-sauge/20 bg-kode01-sauge/5 px-4 py-3">
          <span className="text-sm font-black text-kode01-noir">
            {t('selected_count', { count: selected.size })}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleBulkPublish}
              disabled={bulkLoading}
              className="rounded-full bg-kode01-green text-white hover:bg-kode01-green/90"
            >
              {bulkLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle size={14} className="mr-1" />}
              {t('bulk_publish')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkUnpublish}
              disabled={bulkLoading}
              className="rounded-full border-kode01-noir/20 text-kode01-noir"
            >
              {t('bulk_unpublish')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="rounded-full border-red-300 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} className="mr-1" />
              {t('bulk_delete')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="rounded-full border-black/10 text-kode01-noir/60"
            >
              <Download size={14} className="mr-1" />
              {t('export_csv')}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-[32px] border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-kode01-sauge/3">
                <th className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={posts.length > 0 && selected.size === posts.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-black/20 accent-kode01-green"
                    aria-label={t('select_all')}
                  />
                </th>
                <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_title')}
                </th>
                <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_slug')}
                </th>
                <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_locale')}
                </th>
                <th className="px-4 py-4 text-center text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_status')}
                </th>
                <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_date')}
                </th>
                <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">
                  {t('col_actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-black/5">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <Skeleton className="h-4 w-full rounded bg-black/5" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : posts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-sm text-kode01-noir/40">
                    {t('no_posts')}
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr
                    key={post.id}
                    className={`border-b border-black/5 transition-colors hover:bg-kode01-sauge/3 ${
                      selected.has(post.id) ? 'bg-kode01-green/5' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(post.id)}
                        onChange={() => toggleSelect(post.id)}
                        className="h-4 w-4 rounded border-black/20 accent-kode01-green"
                      />
                    </td>
                    <td className="max-w-[250px] px-4 py-4">
                      <p className="truncate font-bold text-kode01-noir">{post.title}</p>
                      {post.is_sponsored ? (
                        <span className="mr-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                          Sponsored
                        </span>
                      ) : null}
                      {post.hasTranslation && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-kode01-blue">
                          {t('has_translation')}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[180px] px-4 py-4">
                      <p className="truncate text-xs text-kode01-noir/50">{post.slug}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant="outline"
                        className="rounded-full border-black/10 text-[10px] font-black uppercase"
                      >
                        {post.locale.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        className={`rounded-full text-[10px] font-black uppercase ${
                          post.status === 'published'
                            ? 'bg-kode01-green/10 text-kode01-green border-kode01-green/20'
                            : 'bg-kode01-noir/5 text-kode01-noir/40 border-black/10'
                        }`}
                        variant="outline"
                      >
                        {post.status === 'published' ? t('published') : t('draft')}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-kode01-noir/50">
                      {post.published_at
                        ? new Date(post.published_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : new Date(post.created_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/${locale}/admin/cms/editor?id=${post.id}`)}
                          className="rounded-full p-2 text-kode01-noir/40 hover:bg-kode01-sauge/10 hover:text-kode01-noir transition-colors"
                          title={t('action_edit')}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => void handleDuplicate(post)}
                          className="rounded-full p-2 text-kode01-noir/40 hover:bg-kode01-sauge/10 hover:text-kode01-noir transition-colors"
                          title={t('action_duplicate')}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => handleSingleDelete(post.id)}
                          className="rounded-full p-2 text-kode01-noir/40 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title={t('action_delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-bold text-kode01-noir/40">
            {t('showing', { from: (filters.page - 1) * filters.pageSize + 1, to: Math.min(filters.page * filters.pageSize, total), total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => {
                setSelected(new Set());
                void setFilters({ page: filters.page - 1 });
              }}
              className="rounded-full border-black/10"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm font-black text-kode01-noir">
              {filters.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => {
                setSelected(new Set());
                void setFilters({ page: filters.page + 1 });
              }}
              className="rounded-full border-black/10"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-[32px]">
          <DialogHeader>
            <DialogTitle className="font-serif font-black text-kode01-noir">
              {t('delete_confirm_title')}
            </DialogTitle>
            <DialogDescription>
              {t('delete_confirm_desc', { count: deleteTarget?.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-full"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void confirmDelete()}
              disabled={bulkLoading}
              className="rounded-full bg-red-600 text-white hover:bg-red-700"
            >
              {bulkLoading && <Loader2 size={14} className="mr-1 animate-spin" />}
              {t('confirm_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
