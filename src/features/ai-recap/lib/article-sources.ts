import type { RecapContent, RecapLocale, RecapSourceStory } from '../types';

const SAFE_SOURCE_PROTOCOLS = new Set(['http:', 'https:']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export type RecapArticleSource = {
  url: string;
  label: string;
  hostname: string;
};

function resolveLocale(locale: string | RecapLocale): RecapLocale {
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function normalizeExternalSourceUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || CONTROL_CHARACTER_PATTERN.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    if (!SAFE_SOURCE_PROTOCOLS.has(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceKey(url: string): string {
  const parsed = new URL(url);
  const searchParams = new URLSearchParams(parsed.search);
  for (const key of [...searchParams.keys()]) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.startsWith('utm_')
      || lowerKey === 'fbclid'
      || lowerKey === 'gclid'
      || lowerKey === 'msclkid'
    ) {
      searchParams.delete(key);
    }
  }
  parsed.search = searchParams.toString();
  parsed.hash = '';
  return parsed.toString();
}

function hostnameForUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, '');
}

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

function sourceStoryLabel(story: RecapSourceStory | undefined): string | null {
  if (!story) return null;
  return cleanLabel(story.title) ?? cleanLabel(story.source_name);
}

function buildStoryLabels(stories: RecapSourceStory[] | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  for (const story of stories ?? []) {
    const normalizedUrl = normalizeExternalSourceUrl(story.source_url);
    if (!normalizedUrl) continue;

    const label = sourceStoryLabel(story);
    const key = sourceKey(normalizedUrl);
    if (label && !labels.has(key)) {
      labels.set(key, label);
    }
  }
  return labels;
}

export function getRecapArticleSources(
  content: RecapContent | null | undefined,
  locale: string | RecapLocale,
): RecapArticleSource[] {
  if (!content) return [];

  const normalizedLocale = resolveLocale(locale);
  const summary = content.summary30s?.[normalizedLocale];
  const candidateGroups = [
    content.source_manifest?.used_source_urls ?? [],
    summary?.source_urls ?? [],
    [
      summary?.primary_source_url,
      content.source_manifest?.primary_source_url,
      content.bigNews?.source_url,
      ...content.quickHits.map((item) => item.source_url),
    ],
  ];

  const storyLabels = buildStoryLabels(content.sourceStories);

  for (const candidates of candidateGroups) {
    const sources = buildSourcesFromCandidates(candidates, storyLabels);
    if (sources.length > 0) return sources;
  }

  return [];
}

function buildSourcesFromCandidates(
  candidates: Array<string | null | undefined>,
  storyLabels: Map<string, string>,
): RecapArticleSource[] {
  const seen = new Set<string>();
  const sources: RecapArticleSource[] = [];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeExternalSourceUrl(candidate);
    if (!normalizedUrl) continue;

    const key = sourceKey(normalizedUrl);
    if (seen.has(key)) continue;
    seen.add(key);

    const hostname = hostnameForUrl(normalizedUrl);
    sources.push({
      url: normalizedUrl,
      label: storyLabels.get(key) ?? hostname,
      hostname,
    });
  }

  return sources;
}
