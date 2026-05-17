import { unstable_cache } from 'next/cache';
import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import { RecapLocale, RecapPostCard, RecapPostDetail } from '../types';

type JsonRecord = Record<string, unknown>;
type SupabaseQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseQuickHits(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const topic = asString(record.topic);
      const summary = asString(record.summary);
      if (!topic || !summary) return null;

      return {
        topic,
        summary,
        source_url: asString(record.source_url ?? record.sourceUrl) ?? '',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function parseSourceStories(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;

      const sourceUrl = asString(record.source_url ?? record.sourceUrl);
      if (!sourceUrl) return null;

      return {
        source_url: sourceUrl,
        source_name: asString(record.source_name ?? record.sourceName) ?? undefined,
        title: asString(record.title) ?? undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function parseSummary30Locale(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const bulletsRaw = record.bullets;
  if (!Array.isArray(bulletsRaw)) return null;
  const bullets = bulletsRaw
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  if (bullets.length === 0) return null;

  const primarySourceUrl = asString(record.primary_source_url ?? record.primarySourceUrl);
  if (!primarySourceUrl) return null;

  const sourceUrlsRaw = record.source_urls ?? record.sourceUrls;
  const sourceUrls = Array.isArray(sourceUrlsRaw)
    ? sourceUrlsRaw
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
    : [];

  return {
    bullets,
    primary_source_url: primarySourceUrl,
    source_urls: sourceUrls,
  };
}

function parseSummary30(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;

  const fr = parseSummary30Locale(record.fr);
  const en = parseSummary30Locale(record.en);
  if (!fr || !en) return null;

  return {
    fr,
    en,
    generated_at: asString(record.generated_at ?? record.generatedAt) ?? undefined,
    generated_by: asString(record.generated_by ?? record.generatedBy) ?? undefined,
  };
}

function parseSourceManifest(value: unknown) {
  const record = asRecord(value);
  if (!record) return undefined;

  const usedSourceUrlsRaw = record.used_source_urls ?? record.usedSourceUrls;
  const usedSourceUrls = Array.isArray(usedSourceUrlsRaw)
    ? usedSourceUrlsRaw
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
    : [];

  const allowedSourceUrlsRaw = record.allowed_source_urls ?? record.allowedSourceUrls;
  const allowedSourceUrls = Array.isArray(allowedSourceUrlsRaw)
    ? allowedSourceUrlsRaw
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item))
    : [];

  const scrapeMethodsRaw = asRecord(record.scrape_methods_breakdown ?? record.scrapeMethodsBreakdown);
  const scrapeMethodEntries = scrapeMethodsRaw
    ? Object.entries(scrapeMethodsRaw)
      .map(([key, rawValue]) => [key, typeof rawValue === 'number' ? rawValue : Number(rawValue)] as const)
      .filter((entry): entry is readonly [string, number] => Number.isFinite(entry[1]) && entry[1] >= 0)
    : [];
  const scrapeMethodsBreakdown = scrapeMethodsRaw
    ? Object.fromEntries(scrapeMethodEntries)
    : undefined;

  return {
    primary_source_url: asString(record.primary_source_url ?? record.primarySourceUrl) ?? undefined,
    used_source_urls: usedSourceUrls,
    allowed_source_urls: allowedSourceUrls.length > 0 ? allowedSourceUrls : undefined,
    scrape_methods_breakdown:
      scrapeMethodsBreakdown && Object.keys(scrapeMethodsBreakdown).length > 0
        ? scrapeMethodsBreakdown
        : undefined,
    generated_at: asString(record.generated_at ?? record.generatedAt) ?? undefined,
    generated_by: asString(record.generated_by ?? record.generatedBy) ?? undefined,
  };
}

function parseContentJson(value: unknown) {
  let rawValue = value;

  if (typeof rawValue === 'string') {
    try {
      rawValue = JSON.parse(rawValue);
    } catch {
      return null;
    }
  }

  const content = asRecord(rawValue);
  if (!content) return null;

  const bigNews = asRecord(content.bigNews ?? content.big_news);
  if (!bigNews) return null;

  const bigNewsName = asString(bigNews.name);
  const bigNewsImpact = asString(bigNews.impact);
  if (!bigNewsName || !bigNewsImpact) return null;

  return {
    title: asString(content.title) ?? '',
    introduction: asString(content.introduction) ?? '',
    bigNews: {
      name: bigNewsName,
      impact: bigNewsImpact,
      source_url: asString(bigNews.source_url ?? bigNews.sourceUrl) ?? '',
    },
    quickHits: parseQuickHits(content.quickHits ?? content.quick_hits),
    lookingAhead: asString(content.lookingAhead ?? content.looking_ahead) ?? '',
    summary30s: parseSummary30(content.summary30s ?? content.summary_30s) ?? undefined,
    source_manifest: parseSourceManifest(content.source_manifest ?? content.sourceManifest),
    sourceStories: parseSourceStories(content.sourceStories ?? content.source_stories),
  } as RecapPostDetail['content_json'];
}

const FALLBACK_REVALIDATE_SECONDS = 60;

function normalizeError(error: unknown): SupabaseQueryError {
  if (!error || typeof error !== 'object') return {};

  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    details: typeof record.details === 'string' ? record.details : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
  };
}

function isMissingTagsColumnError(error: unknown): boolean {
  const parsed = normalizeError(error);
  const text = `${parsed.message ?? ''} ${parsed.details ?? ''}`.toLowerCase();

  return parsed.code === '42703'
    || (text.includes('column') && text.includes('tags') && text.includes('does not exist'));
}

async function fetchPublishedRecapPosts(
  limit: number,
  locale?: string,
): Promise<{ data: RecapPostCard[] | null; error: SupabaseQueryError | null }> {
  const supabase = createPublicServerClient();
  let queryWithTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, tags, published_at, clap_count')
    .eq('is_published', true);

  if (locale) {
    queryWithTags = queryWithTags.eq('locale', locale);
  }

  const withTagsResult = await queryWithTags
    .order('published_at', { ascending: false })
    .limit(limit);

  if (!withTagsResult.error) {
    return {
      data: (withTagsResult.data ?? []) as RecapPostCard[],
      error: null,
    };
  }

  if (!isMissingTagsColumnError(withTagsResult.error)) {
    return {
      data: null,
      error: normalizeError(withTagsResult.error),
    };
  }

  // Compatibility fallback for databases that don't have ai_recap_posts.tags or clap_count yet.
  let queryWithoutTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, published_at')
    .eq('is_published', true);

  if (locale) {
    queryWithoutTags = queryWithoutTags.eq('locale', locale);
  }

  const withoutTagsResult = await queryWithoutTags
    .order('published_at', { ascending: false })
    .limit(limit);

  if (withoutTagsResult.error) {
    return {
      data: null,
      error: normalizeError(withoutTagsResult.error),
    };
  }

  const fallbackRows = (withoutTagsResult.data ?? []) as Omit<RecapPostCard, 'tags' | 'clap_count'>[];
  return {
    data: fallbackRows.map((row) => ({ ...row, tags: [], clap_count: 0 })),
    error: null,
  };
}

async function fetchPublishedRecapPostsPage(args: {
  limit: number;
  offset: number;
  locale?: string;
  sort: 'newest' | 'oldest';
}): Promise<{ data: RecapPostCard[] | null; total: number; error: SupabaseQueryError | null }> {
  const { limit, offset, locale, sort } = args;
  const supabase = createPublicServerClient();
  let queryWithTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, tags, published_at, clap_count', { count: 'planned' })
    .eq('is_published', true);

  if (locale) {
    queryWithTags = queryWithTags.eq('locale', locale);
  }

  const withTagsResult = await queryWithTags
    .order('published_at', { ascending: sort === 'oldest' })
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + limit - 1);

  if (!withTagsResult.error) {
    return {
      data: (withTagsResult.data ?? []) as RecapPostCard[],
      total: withTagsResult.count ?? 0,
      error: null,
    };
  }

  if (!isMissingTagsColumnError(withTagsResult.error)) {
    return {
      data: null,
      total: 0,
      error: normalizeError(withTagsResult.error),
    };
  }

  let queryWithoutTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, published_at', { count: 'planned' })
    .eq('is_published', true);

  if (locale) {
    queryWithoutTags = queryWithoutTags.eq('locale', locale);
  }

  const withoutTagsResult = await queryWithoutTags
    .order('published_at', { ascending: sort === 'oldest' })
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + limit - 1);

  if (withoutTagsResult.error) {
    return {
      data: null,
      total: 0,
      error: normalizeError(withoutTagsResult.error),
    };
  }

  const fallbackRows = (withoutTagsResult.data ?? []) as Omit<RecapPostCard, 'tags' | 'clap_count'>[];
  return {
    data: fallbackRows.map((row) => ({ ...row, tags: [], clap_count: 0 })),
    total: withoutTagsResult.count ?? fallbackRows.length,
    error: null,
  };
}

async function fetchRecapPostBySlug(slug: string, locale?: RecapLocale): Promise<RecapPostDetail | null> {
  const supabase = createPublicServerClient();
  let queryWithTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, tags, published_at, content_markdown, content_json')
    .eq('slug', slug)
    .eq('is_published', true);

  if (locale) {
    queryWithTags = queryWithTags.eq('locale', locale);
  }

  const withTagsResult = await queryWithTags
    .maybeSingle();

  if (!withTagsResult.error) {
    const data = withTagsResult.data;
    if (!data) return null;

    return {
      ...data,
      content_json: parseContentJson(data.content_json),
    } as RecapPostDetail;
  }

  if (!isMissingTagsColumnError(withTagsResult.error)) {
    return null;
  }

  let queryWithoutTags = supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, published_at, content_markdown, content_json')
    .eq('slug', slug)
    .eq('is_published', true);

  if (locale) {
    queryWithoutTags = queryWithoutTags.eq('locale', locale);
  }

  const withoutTagsResult = await queryWithoutTags
    .maybeSingle();

  if (withoutTagsResult.error || !withoutTagsResult.data) {
    return null;
  }

  const data = withoutTagsResult.data as Omit<RecapPostDetail, 'tags'>;
  return {
    ...data,
    tags: [],
    content_json: parseContentJson(data.content_json),
  };
}

async function fetchSiblingRecapPosts(editionId: string, excludeSlug: string): Promise<RecapPostCard[]> {
  const supabase = createPublicServerClient();
  const withTagsResult = await supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, tags, published_at, clap_count')
    .eq('edition_id', editionId)
    .eq('is_published', true)
    .neq('slug', excludeSlug);

  if (!withTagsResult.error) {
    return (withTagsResult.data ?? []) as RecapPostCard[];
  }

  if (!isMissingTagsColumnError(withTagsResult.error)) {
    return [];
  }

  const withoutTagsResult = await supabase
    .from('ai_recap_posts')
    .select('id, edition_id, locale, slug, title, intro, excerpt, published_at')
    .eq('edition_id', editionId)
    .eq('is_published', true)
    .neq('slug', excludeSlug);

  if (withoutTagsResult.error) {
    return [];
  }

  const rows = (withoutTagsResult.data ?? []) as Omit<RecapPostCard, 'tags' | 'clap_count'>[];
  return rows.map((row) => ({ ...row, tags: [], clap_count: 0 }));
}

const getPublishedRecapPostsCached = unstable_cache(
  async (limit: number, locale?: string): Promise<RecapPostCard[]> => {
    const { data, error } = await fetchPublishedRecapPosts(limit, locale);

    if (error || !data) {
      const details = error ?? {};
      // Graceful degradation: avoid server console.error noise for expected data-layer failures.
      console.warn('Failed to fetch recap posts:', details.message ?? 'Unknown error', details);
      return [];
    }

    return data;
  },
  ['news:published:list:v1'],
  { tags: [PUBLIC_CACHE_TAGS.news], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getPublishedRecapPostsPageCached = unstable_cache(
  async (
    limit: number,
    offset: number,
    locale?: string,
    sort: 'newest' | 'oldest' = 'newest',
  ): Promise<{ data: RecapPostCard[]; total: number }> => {
    const { data, total, error } = await fetchPublishedRecapPostsPage({
      limit,
      offset,
      locale,
      sort,
    });
    if (error || !data) {
      const details = error ?? {};
      console.warn('Failed to fetch recap posts page:', details.message ?? 'Unknown error', details);
      return { data: [], total: 0 };
    }

    return { data, total };
  },
  ['news:published:list-page:v1'],
  { tags: [PUBLIC_CACHE_TAGS.news], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getRecapPostBySlugCached = unstable_cache(
  async (slug: string): Promise<RecapPostDetail | null> => {
    return fetchRecapPostBySlug(slug);
  },
  ['news:published:detail:v1'],
  { tags: [PUBLIC_CACHE_TAGS.news], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getRecapPostBySlugAndLocaleCached = unstable_cache(
  async (slug: string, locale: RecapLocale): Promise<RecapPostDetail | null> => {
    return fetchRecapPostBySlug(slug, locale);
  },
  ['news:published:detail-by-locale:v1'],
  { tags: [PUBLIC_CACHE_TAGS.news], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

const getSiblingRecapPostsCached = unstable_cache(
  async (editionId: string, excludeSlug: string): Promise<RecapPostCard[]> => {
    return fetchSiblingRecapPosts(editionId, excludeSlug);
  },
  ['news:published:siblings:v1'],
  { tags: [PUBLIC_CACHE_TAGS.news], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

export async function getPublishedRecapPosts(limit = 50, locale?: string): Promise<RecapPostCard[]> {
  return getPublishedRecapPostsCached(limit, locale);
}

export async function getPublishedRecapPostsPage(args: {
  limit?: number;
  offset?: number;
  locale?: string;
  sort?: 'newest' | 'oldest';
}): Promise<{ data: RecapPostCard[]; total: number }> {
  const limit = Math.min(48, Math.max(1, args.limit ?? 24));
  const offset = Math.max(0, args.offset ?? 0);
  return getPublishedRecapPostsPageCached(limit, offset, args.locale, args.sort ?? 'newest');
}

export async function getRecapPostBySlug(slug: string): Promise<RecapPostDetail | null> {
  return getRecapPostBySlugCached(slug);
}

export async function getRecapPostBySlugAndLocale(slug: string, locale: RecapLocale): Promise<RecapPostDetail | null> {
  return getRecapPostBySlugAndLocaleCached(slug, locale);
}

export async function getSiblingRecapPosts(editionId: string, excludeSlug: string) {
  return getSiblingRecapPostsCached(editionId, excludeSlug);
}
