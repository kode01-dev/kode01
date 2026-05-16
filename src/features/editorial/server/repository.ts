import { unstable_cache } from 'next/cache';
import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizeLoopbackStorageUrlsInText,
  normalizePublicStorageUrl,
} from '@/lib/images/server/public-storage-url-normalizer';
import type { EditorialPostDetail, EditorialPostListItem, EditorialLocale } from '@/features/editorial/types';
import {
  EDITORIAL_DETAIL_SELECT,
  EDITORIAL_DETAIL_SELECT_LEGACY,
  EDITORIAL_LIST_SELECT,
  EDITORIAL_LIST_SELECT_LEGACY,
  isMissingAuthorNameColumnError,
  normalizeAuthorNameRow,
  normalizeAuthorNameRows,
} from '@/features/editorial/server/author-name-compat';

const FALLBACK_REVALIDATE_SECONDS = 60;

function createEditorialReadClient() {
  try {
    return createAdminClient();
  } catch {
    // Fallback for environments without service-role key configured.
    return createPublicServerClient();
  }
}

function toMinuteBucket(date: Date): number {
  return Math.floor(date.getTime() / 60_000);
}

function isoFromMinuteBucket(minuteBucket: number): string {
  return new Date(minuteBucket * 60_000).toISOString();
}

function normalizeEditorialCoverImageUrl<T extends { cover_image_url: string | null }>(item: T): T {
  return {
    ...item,
    cover_image_url: normalizePublicStorageUrl(item.cover_image_url),
  };
}

function normalizeEditorialListItem(item: EditorialPostListItem): EditorialPostListItem {
  return normalizeEditorialCoverImageUrl(item);
}

function normalizeEditorialDetailItem(item: EditorialPostDetail): EditorialPostDetail {
  return {
    ...normalizeEditorialCoverImageUrl(item),
    content_markdown: normalizeLoopbackStorageUrlsInText(item.content_markdown),
  };
}

const getPublishedEditorialPostsCached = unstable_cache(
  async (
    locale: EditorialLocale,
    page: number,
    pageSize: number,
    sort: 'newest' | 'oldest',
    minuteBucket: number,
  ): Promise<{ data: EditorialPostListItem[]; total: number }> => {
    const supabase = createEditorialReadClient();
    const nowIso = isoFromMinuteBucket(minuteBucket);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const runListQuery = (selectClause: string) => {
      return supabase
        .from('editorial_posts')
        .select(selectClause, { count: 'exact' })
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', nowIso)
        .eq('locale', locale)
        .order('published_at', { ascending: sort === 'oldest', nullsFirst: false })
        .order('created_at', { ascending: sort === 'oldest' })
        .range(from, to);
    };

    let result = await runListQuery(EDITORIAL_LIST_SELECT);
    if (isMissingAuthorNameColumnError(result.error)) {
      result = await runListQuery(EDITORIAL_LIST_SELECT_LEGACY);
    }

    const { data, error, count } = result;

    if (error || !data) {
      console.warn('Failed to fetch published editorial posts:', error?.message ?? error);
      return { data: [], total: 0 };
    }

    const normalized = normalizeAuthorNameRows(data as unknown as Record<string, unknown>[]) as EditorialPostListItem[];
    const normalizedForPublic = normalized.map(normalizeEditorialListItem);

    return {
      data: normalizedForPublic,
      total: count ?? normalizedForPublic.length,
    };
  },
  ['editorial:published:list:v1'],
  { tags: [PUBLIC_CACHE_TAGS.editorial], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getPublishedEditorialPostBySlugCached = unstable_cache(
  async (
    locale: EditorialLocale,
    slug: string,
    minuteBucket: number,
  ): Promise<EditorialPostDetail | null> => {
    const supabase = createEditorialReadClient();
    const nowIso = isoFromMinuteBucket(minuteBucket);
    const runDetailQuery = (selectClause: string) => {
      return supabase
        .from('editorial_posts')
        .select(selectClause)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', nowIso)
        .eq('locale', locale)
        .eq('slug', slug)
        .maybeSingle();
    };

    let result = await runDetailQuery(EDITORIAL_DETAIL_SELECT);
    if (isMissingAuthorNameColumnError(result.error)) {
      result = await runDetailQuery(EDITORIAL_DETAIL_SELECT_LEGACY);
    }

    const { data, error } = result;

    if (error || !data) {
      return null;
    }

    const normalized = normalizeAuthorNameRow(data as unknown as Record<string, unknown>) as EditorialPostDetail;
    return normalizeEditorialDetailItem(normalized);
  },
  ['editorial:published:detail:v1'],
  { tags: [PUBLIC_CACHE_TAGS.editorial], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getEditorialTranslationsCached = unstable_cache(
  async (translationGroupId: string, minuteBucket: number): Promise<EditorialPostListItem[]> => {
    const supabase = createEditorialReadClient();
    const nowIso = isoFromMinuteBucket(minuteBucket);
    const runTranslationQuery = (selectClause: string) => {
      return supabase
        .from('editorial_posts')
        .select(selectClause)
        .eq('translation_group_id', translationGroupId)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .lte('published_at', nowIso)
        .order('locale', { ascending: true });
    };

    let result = await runTranslationQuery(EDITORIAL_LIST_SELECT);
    if (isMissingAuthorNameColumnError(result.error)) {
      result = await runTranslationQuery(EDITORIAL_LIST_SELECT_LEGACY);
    }

    const { data, error } = result;

    if (error || !data) {
      console.warn('Failed to fetch editorial translations:', error?.message ?? error);
      return [];
    }

    const normalized = normalizeAuthorNameRows(data as unknown as Record<string, unknown>[]) as EditorialPostListItem[];
    return normalized.map(normalizeEditorialListItem);
  },
  ['editorial:published:translations:v1'],
  { tags: [PUBLIC_CACHE_TAGS.editorial], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

export async function getPublishedEditorialPosts(args: {
  locale: EditorialLocale;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest';
}): Promise<{ data: EditorialPostListItem[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 12));
  const sort = args.sort ?? 'newest';
  const minuteBucket = toMinuteBucket(new Date());
  return getPublishedEditorialPostsCached(args.locale, page, pageSize, sort, minuteBucket);
}

export async function getPublishedEditorialPostBySlug(args: {
  locale: EditorialLocale;
  slug: string;
}): Promise<EditorialPostDetail | null> {
  const minuteBucket = toMinuteBucket(new Date());
  return getPublishedEditorialPostBySlugCached(args.locale, args.slug, minuteBucket);
}

export async function getEditorialTranslations(translationGroupId: string): Promise<EditorialPostListItem[]> {
  const minuteBucket = toMinuteBucket(new Date());
  return getEditorialTranslationsCached(translationGroupId, minuteBucket);
}
