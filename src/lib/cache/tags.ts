export const PUBLIC_CACHE_TAGS = {
  editorial: 'editorial',
  news: 'news',
  market: 'market',
  creators: 'creators',
} as const;

export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[keyof typeof PUBLIC_CACHE_TAGS];

export const PUBLIC_CACHE_TAG_VALUES = Object.values(PUBLIC_CACHE_TAGS) as PublicCacheTag[];
