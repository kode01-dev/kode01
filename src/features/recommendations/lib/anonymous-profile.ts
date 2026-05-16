import { RecommendationEventPayload, AnonymousRecommendationProfile } from '../types';

const PROFILE_VERSION = 1;
const MAX_KEYWORD_BUCKETS = 60;
const MAX_CLICKED_PRODUCTS = 30;

function sanitizeKeywordWeights(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};

  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([key, value]) => typeof key === 'string' && typeof value === 'number' && Number.isFinite(value) && value > 0)
    .map(([key, value]) => [key.toLowerCase(), Number(value)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORD_BUCKETS);

  return Object.fromEntries(entries);
}

export function parseAnonymousRecommendationProfile(rawValue?: string): AnonymousRecommendationProfile | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<AnonymousRecommendationProfile>;
    if (parsed.version !== PROFILE_VERSION) return null;

    return {
      version: PROFILE_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      keywordWeights: sanitizeKeywordWeights(parsed.keywordWeights),
      recentClickedProductIds: Array.isArray(parsed.recentClickedProductIds)
        ? parsed.recentClickedProductIds.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX_CLICKED_PRODUCTS)
        : [],
    };
  } catch {
    return null;
  }
}

function eventWeight(eventType: RecommendationEventPayload['eventType']): number {
  if (eventType === 'recommendation_click') return 3;
  return 1;
}

export function applyEventToAnonymousProfile(
  current: AnonymousRecommendationProfile | null,
  payload: RecommendationEventPayload,
): AnonymousRecommendationProfile {
  const base: AnonymousRecommendationProfile = current ?? {
    version: PROFILE_VERSION,
    updatedAt: new Date(0).toISOString(),
    keywordWeights: {},
    recentClickedProductIds: [],
  };

  const weight = eventWeight(payload.eventType);
  const keywordWeights = { ...base.keywordWeights };
  const keywords = Array.isArray(payload.signalPayload?.keywords) ? payload.signalPayload.keywords : [];

  keywords
    .filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 1)
    .map((keyword) => keyword.trim().toLowerCase())
    .forEach((keyword) => {
      keywordWeights[keyword] = (keywordWeights[keyword] ?? 0) + weight;
    });

  const trimmedKeywordWeights = sanitizeKeywordWeights(keywordWeights);

  const recentClickedProductIds = [...base.recentClickedProductIds];
  if (payload.eventType === 'recommendation_click' && payload.targetProductId) {
    const next = [payload.targetProductId, ...recentClickedProductIds.filter((id) => id !== payload.targetProductId)];
    recentClickedProductIds.splice(0, recentClickedProductIds.length, ...next.slice(0, MAX_CLICKED_PRODUCTS));
  }

  return {
    version: PROFILE_VERSION,
    updatedAt: new Date().toISOString(),
    keywordWeights: trimmedKeywordWeights,
    recentClickedProductIds,
  };
}
