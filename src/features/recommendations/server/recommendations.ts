import 'server-only';

import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { scoreSearchQuery } from '@/lib/search';
import { createClient } from '@/lib/supabase/server';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import {
  ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
  COOKIE_CONSENT_COOKIE_NAME,
  LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
} from '@/features/cookies/lib/consent';
import { AnonymousRecommendationProfile, RecommendationContext, RecommendedPaidProduct } from '../types';
import { hasAnalyticsConsentFromCcCookie } from '../lib/consent';
import { parseAnonymousRecommendationProfile } from '../lib/anonymous-profile';
import { extractKeywordTokens } from '../lib/keywords';

type ProductCandidateRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  content_locales: string[] | null;
  content_source_locale: 'fr' | 'en' | null;
  price: number | string | null;
  is_pwyw: boolean | null;
  min_price: number | string | null;
  cover_image_url: string | null;
  category: string | null;
  tags: unknown;
  created_at: string;
  profiles:
  | {
    display_name: string | null;
    shop_name: string | null;
  }
  | Array<{
    display_name: string | null;
    shop_name: string | null;
  }>
  | null;
};

type PurchaseRow = {
  product_id: string;
};

type ProductViewRow = {
  product_id: string;
  count: number | null;
};

type RecommendationEventRow = {
  event_type: 'product_view' | 'recommendation_click';
  signal_payload: {
    keywords?: string[];
  } | null;
  target_product_id: string | null;
};

type PrecomputedPopularityRow = {
  product_id: string;
  sales_90d: number | null;
  views_90d: number | null;
};

interface CandidateMetrics {
  salesCount: number;
  viewsCount: number;
  relevanceRaw: number;
  freshness: number;
  globalScore: number;
  affinityRaw: number;
  finalScore: number;
}

function toNumeric(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string');
}

function getProfileName(
  profile:
  | ProductCandidateRow['profiles']
  | null
  | undefined,
): string {
  if (!profile) return 'Anonymous';
  const row = Array.isArray(profile) ? profile[0] ?? null : profile;
  if (!row) return 'Anonymous';
  return row.shop_name || row.display_name || 'Anonymous';
}

function isPaidCandidate(row: ProductCandidateRow): boolean {
  const price = toNumeric(row.price);
  const isPWYW = Boolean(row.is_pwyw);
  const minPrice = toNumeric(row.min_price);

  return price > 0 || (isPWYW && minPrice > 0);
}

function buildContextQuery(context: RecommendationContext): string {
  return [context.title, context.category, ...(context.tags ?? [])].filter(Boolean).join(' ');
}

function profileEventWeight(eventType: RecommendationEventRow['event_type']): number {
  if (eventType === 'recommendation_click') return 3;
  return 1;
}

function buildUserKeywordProfile(events: RecommendationEventRow[]): {
  keywordWeights: Record<string, number>;
  recentClickedProductIds: string[];
} {
  const keywordWeights: Record<string, number> = {};
  const recentClickedProductIds: string[] = [];

  for (const event of events) {
    const weight = profileEventWeight(event.event_type);
    const keywords = Array.isArray(event.signal_payload?.keywords) ? event.signal_payload?.keywords : [];

    for (const keyword of keywords) {
      if (typeof keyword !== 'string' || keyword.length < 2) continue;
      const normalized = keyword.toLowerCase();
      keywordWeights[normalized] = (keywordWeights[normalized] ?? 0) + weight;
    }

    if (event.event_type === 'recommendation_click' && event.target_product_id) {
      if (!recentClickedProductIds.includes(event.target_product_id)) {
        recentClickedProductIds.push(event.target_product_id);
      }
      if (recentClickedProductIds.length >= 30) break;
    }
  }

  return {
    keywordWeights,
    recentClickedProductIds,
  };
}

function calculateAffinityRaw(
  candidate: RecommendedPaidProduct,
  keywordWeights: Record<string, number>,
  recentClickedProductIds: string[],
): number {
  if (Object.keys(keywordWeights).length === 0 && recentClickedProductIds.length === 0) return 0;

  const tokens = extractKeywordTokens([
    candidate.title,
    candidate.description,
    candidate.category,
    candidate.tags.join(' '),
    candidate.sellerName,
  ]);

  let score = 0;
  for (const token of tokens) {
    score += keywordWeights[token] ?? 0;
  }

  if (recentClickedProductIds.includes(candidate.id)) {
    score += 2;
  }

  return score;
}

function normalizeByMax(value: number, max: number): number {
  if (max <= 0) return 0;
  return value / max;
}

function rankFallback(a: CandidateMetrics, b: CandidateMetrics): number {
  if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
  if (b.viewsCount !== a.viewsCount) return b.viewsCount - a.viewsCount;
  return b.freshness - a.freshness;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  return code === '42P01';
}

function getAnonProfileFromCookies(cookieStore: Awaited<ReturnType<typeof cookies>>): AnonymousRecommendationProfile | null {
  const ccCookie = cookieStore.get(COOKIE_CONSENT_COOKIE_NAME)?.value;
  if (!hasAnalyticsConsentFromCcCookie(ccCookie)) {
    return null;
  }

  return parseAnonymousRecommendationProfile(
    cookieStore.get(ANONYMOUS_RECO_PROFILE_COOKIE_NAME)?.value
    ?? cookieStore.get(LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME)?.value,
  );
}

function applyLimitWithFallback({
  candidates,
  metricsByProduct,
  limit,
}: {
  candidates: RecommendedPaidProduct[];
  metricsByProduct: Map<string, CandidateMetrics>;
  limit: number;
}): RecommendedPaidProduct[] {
  if (candidates.length >= limit) {
    return candidates.slice(0, limit);
  }

  const withFallback = [...candidates];
  const alreadySelected = new Set(withFallback.map((entry) => entry.id));

  const fallbackPool = candidates
    .filter((candidate) => !alreadySelected.has(candidate.id))
    .sort((a, b) => {
      const metricsA = metricsByProduct.get(a.id);
      const metricsB = metricsByProduct.get(b.id);
      if (!metricsA || !metricsB) return 0;
      return rankFallback(metricsA, metricsB);
    });

  for (const candidate of fallbackPool) {
    withFallback.push(candidate);
    if (withFallback.length >= limit) break;
  }

  return withFallback.slice(0, limit);
}

async function buildGlobalRecommendationRanking({
  context,
  supabase,
}: {
  context: RecommendationContext;
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createPublicServerClient>;
}): Promise<{
  ranked: RecommendedPaidProduct[];
  metricsByProduct: Map<string, CandidateMetrics>;
}> {
  const { data: productRows, error: productError } = await supabase
    .from('products')
    .select(`
      id,
      slug,
      title,
      description,
      content_locales,
      content_source_locale,
      price,
      is_pwyw,
      min_price,
      cover_image_url,
      category,
      tags,
      created_at,
      profiles!seller_id (
        display_name,
        shop_name
      )
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(240);

  if (productError || !productRows) {
    console.error('Failed to load recommendation product candidates:', productError);
    return {
      ranked: [],
      metricsByProduct: new Map<string, CandidateMetrics>(),
    };
  }

  const candidates = (productRows as ProductCandidateRow[])
    .filter((row) => row.slug && isPaidCandidate(row))
    .map((row) => ({
      id: row.id,
      slug: row.slug as string,
      title: row.title,
      description: row.description ?? '',
      price: toNumeric(row.price),
      isPWYW: Boolean(row.is_pwyw),
      minPrice: toNumeric(row.min_price),
      coverImageUrl: row.cover_image_url,
      sellerName: getProfileName(row.profiles),
      category: row.category,
      tags: normalizeTags(row.tags),
      contentLocales: Array.isArray(row.content_locales)
        ? row.content_locales.filter((value): value is 'fr' | 'en' => value === 'fr' || value === 'en')
        : null,
      contentSourceLocale:
        row.content_source_locale === 'fr' || row.content_source_locale === 'en'
          ? row.content_source_locale
          : null,
      createdAt: row.created_at,
      score: 0,
    }))
    .filter((row) => {
      if (context.type !== 'product') return true;
      return row.id !== context.currentProductId;
    });

  if (candidates.length === 0) {
    return {
      ranked: [],
      metricsByProduct: new Map<string, CandidateMetrics>(),
    };
  }

  const candidateIds = candidates.map((candidate) => candidate.id);

  const popularityResult = await supabase
    .from('product_popularity_agg_90d')
    .select('product_id, sales_90d, views_90d')
    .in('product_id', candidateIds);

  let purchasesResult: { data: PurchaseRow[] | null; error: unknown } = { data: null, error: null };
  let viewsResult: { data: ProductViewRow[] | null; error: unknown } = { data: null, error: null };
  if (popularityResult.error && !isMissingRelationError(popularityResult.error)) {
    console.error('Failed to fetch precomputed popularity table:', popularityResult.error);
  }
  if (popularityResult.error || !popularityResult.data) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    [purchasesResult, viewsResult] = await Promise.all([
      supabase
        .from('purchases')
        .select('product_id')
        .eq('status', 'completed')
        .in('product_id', candidateIds)
        .limit(12000),
      supabase
        .from('product_views')
        .select('product_id, count')
        .gte('view_date', ninetyDaysAgo.toISOString().split('T')[0])
        .in('product_id', candidateIds)
        .limit(20000),
    ]);
  }

  const salesByProduct = new Map<string, number>();
  const viewsByProduct = new Map<string, number>();

  if (!popularityResult.error && popularityResult.data) {
    for (const row of popularityResult.data as PrecomputedPopularityRow[]) {
      salesByProduct.set(row.product_id, toNumeric(row.sales_90d));
      viewsByProduct.set(row.product_id, toNumeric(row.views_90d));
    }
  } else {
    for (const row of (purchasesResult.data ?? []) as PurchaseRow[]) {
      salesByProduct.set(row.product_id, (salesByProduct.get(row.product_id) ?? 0) + 1);
    }

    for (const row of (viewsResult.data ?? []) as ProductViewRow[]) {
      const increment = toNumeric(row.count);
      viewsByProduct.set(row.product_id, (viewsByProduct.get(row.product_id) ?? 0) + increment);
    }
  }

  const contextQuery = buildContextQuery(context);
  const metricsByProduct = new Map<string, CandidateMetrics>();

  let maxRelevance = 0;
  let maxSalesLog = 0;
  let maxViewsLog = 0;

  for (const candidate of candidates) {
    const relevanceRaw = contextQuery
      ? scoreSearchQuery(contextQuery, [
        { value: candidate.title, weight: 6.0 },
        { value: candidate.category, weight: 3.8 },
        { value: candidate.tags.join(' '), weight: 3.5 },
        { value: candidate.description, weight: 2.6 },
      ]) ?? 0
      : 0;

    const salesCount = salesByProduct.get(candidate.id) ?? 0;
    const viewsCount = viewsByProduct.get(candidate.id) ?? 0;
    const salesLog = Math.log1p(salesCount);
    const viewsLog = Math.log1p(viewsCount);

    const createdAtMs = Date.parse(candidate.createdAt);
    const ageDays = Number.isFinite(createdAtMs)
      ? Math.max(0, (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24))
      : 365;
    const freshness = Math.exp(-ageDays / 180);

    maxRelevance = Math.max(maxRelevance, relevanceRaw);
    maxSalesLog = Math.max(maxSalesLog, salesLog);
    maxViewsLog = Math.max(maxViewsLog, viewsLog);

    metricsByProduct.set(candidate.id, {
      salesCount,
      viewsCount,
      relevanceRaw,
      freshness,
      globalScore: 0,
      affinityRaw: 0,
      finalScore: 0,
    });
  }

  for (const candidate of candidates) {
    const metrics = metricsByProduct.get(candidate.id);
    if (!metrics) continue;
    const salesLog = Math.log1p(metrics.salesCount);
    const viewsLog = Math.log1p(metrics.viewsCount);

    const relevanceScore = normalizeByMax(metrics.relevanceRaw, maxRelevance);
    const salesScore = normalizeByMax(salesLog, maxSalesLog);
    const viewsScore = normalizeByMax(viewsLog, maxViewsLog);

    metrics.globalScore = (0.45 * relevanceScore) + (0.35 * salesScore) + (0.15 * viewsScore) + (0.05 * metrics.freshness);
  }

  const ranked = candidates.map((candidate) => {
    const metrics = metricsByProduct.get(candidate.id);
    if (!metrics) return candidate;

    return {
      ...candidate,
      score: metrics.globalScore,
    };
  });

  ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return {
    ranked,
    metricsByProduct,
  };
}

export async function getRecommendedPaidProducts({
  context,
  limit = 4,
  personalize = true,
}: {
  context: RecommendationContext;
  limit?: number;
  personalize?: boolean;
}): Promise<RecommendedPaidProduct[]> {
  const supabase = await createClient();
  const { ranked, metricsByProduct } = await buildGlobalRecommendationRanking({
    context,
    supabase,
  });

  if (ranked.length === 0) {
    return [];
  }

  if (!personalize) {
    return applyLimitWithFallback({
      candidates: ranked,
      metricsByProduct,
      limit,
    });
  }

  const authResult = await supabase.auth.getUser();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const signedInUser = authResult.data.user;

  let personalizedRanked = ranked;
  if (signedInUser) {
    const { data: eventsData, error: eventsError } = await supabase
      .from('recommendation_events')
      .select('event_type, signal_payload, target_product_id')
      .eq('user_id', signedInUser.id)
      .gte('created_at', twelveMonthsAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (!eventsError && eventsData) {
      const profile = buildUserKeywordProfile(eventsData as RecommendationEventRow[]);
      if (Object.keys(profile.keywordWeights).length > 0 || profile.recentClickedProductIds.length > 0) {
        let maxAffinityRaw = 0;
        for (const candidate of personalizedRanked) {
          const metrics = metricsByProduct.get(candidate.id);
          if (!metrics) continue;
          metrics.affinityRaw = calculateAffinityRaw(
            candidate,
            profile.keywordWeights,
            profile.recentClickedProductIds,
          );
          maxAffinityRaw = Math.max(maxAffinityRaw, metrics.affinityRaw);
        }

        personalizedRanked = personalizedRanked
          .map((candidate) => {
            const metrics = metricsByProduct.get(candidate.id);
            if (!metrics) return candidate;
            const affinity = normalizeByMax(metrics.affinityRaw, maxAffinityRaw);
            return {
              ...candidate,
              score: (0.70 * metrics.globalScore) + (0.30 * affinity),
            };
          })
          .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
      }
    } else if (eventsError) {
      console.error('Failed to fetch recommendation events for signed-in user:', eventsError);
    }
  } else {
    const cookieStore = await cookies();
    const anonProfile = getAnonProfileFromCookies(cookieStore);
    if (anonProfile) {
      let maxAffinityRaw = 0;
      for (const candidate of personalizedRanked) {
        const metrics = metricsByProduct.get(candidate.id);
        if (!metrics) continue;
        metrics.affinityRaw = calculateAffinityRaw(
          candidate,
          anonProfile.keywordWeights,
          anonProfile.recentClickedProductIds,
        );
        maxAffinityRaw = Math.max(maxAffinityRaw, metrics.affinityRaw);
      }

      personalizedRanked = personalizedRanked
        .map((candidate) => {
          const metrics = metricsByProduct.get(candidate.id);
          if (!metrics) return candidate;
          const affinity = normalizeByMax(metrics.affinityRaw, maxAffinityRaw);
          return {
            ...candidate,
            score: (0.85 * metrics.globalScore) + (0.15 * affinity),
          };
        })
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    }
  }

  return applyLimitWithFallback({
    candidates: personalizedRanked,
    metricsByProduct,
    limit,
  });
}

async function getRecommendedPaidProductsGlobal({
  context,
  limit = 4,
}: {
  context: RecommendationContext;
  limit?: number;
}): Promise<RecommendedPaidProduct[]> {
  const supabase = createPublicServerClient();
  const { ranked, metricsByProduct } = await buildGlobalRecommendationRanking({
    context,
    supabase,
  });

  return applyLimitWithFallback({
    candidates: ranked,
    metricsByProduct,
    limit,
  });
}

const getRecommendedPaidProductsGlobalCachedInternal = unstable_cache(
  async (contextJson: string, limit: number): Promise<RecommendedPaidProduct[]> => {
    const context = JSON.parse(contextJson) as RecommendationContext;
    return getRecommendedPaidProductsGlobal({
      context,
      limit,
    });
  },
  ['recommendations:global:v1'],
  { tags: [PUBLIC_CACHE_TAGS.market], revalidate: 120 },
);

export async function getRecommendedPaidProductsGlobalCached({
  context,
  limit = 4,
}: {
  context: RecommendationContext;
  limit?: number;
}): Promise<RecommendedPaidProduct[]> {
  return getRecommendedPaidProductsGlobalCachedInternal(JSON.stringify(context), limit);
}
