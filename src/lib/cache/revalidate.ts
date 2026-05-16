import { revalidateTag } from 'next/cache';
import { PUBLIC_CACHE_TAGS, PUBLIC_CACHE_TAG_VALUES, type PublicCacheTag } from './tags';

type RevalidateTagCompat = {
  (tag: string): void;
  (tag: string, profile: 'max'): void;
};

const revalidateTagCompat = revalidateTag as unknown as RevalidateTagCompat;

export function isPublicCacheTag(value: string): value is PublicCacheTag {
  return (PUBLIC_CACHE_TAG_VALUES as readonly string[]).includes(value);
}

export function revalidateCacheTag(tag: string) {
  revalidateTagCompat(tag, 'max');
}

export function revalidatePublicCacheTags(tags: readonly PublicCacheTag[]) {
  const uniqueTags = new Set(tags);
  for (const tag of uniqueTags) {
    revalidateCacheTag(tag);
  }
}

export function revalidateEditorialContent() {
  revalidatePublicCacheTags([PUBLIC_CACHE_TAGS.editorial]);
}

export function revalidateNewsContent() {
  revalidatePublicCacheTags([PUBLIC_CACHE_TAGS.news]);
}

export function revalidateMarketContent() {
  revalidatePublicCacheTags([PUBLIC_CACHE_TAGS.market]);
}

export function revalidateCreatorsContent() {
  revalidatePublicCacheTags([PUBLIC_CACHE_TAGS.creators]);
}
