import 'server-only';

import type { Metadata } from 'next';
import * as React from 'react';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';
import { logInvalidSeoMetadata } from '@/lib/seo-metadata-audit';

export const CANONICAL_SITE_URL = 'https://kode01.com';
const CANONICAL_HOST = 'kode01.com';
const CANONICAL_WWW_HOST = 'www.kode01.com';
const DEFAULT_KODE_SITE_ID = 'dOEjhY5ORp';
const DEFAULT_KODE_API_BASE = 'https://seo-app-kode01.vercel.app';
const PRIVATE_ROUTE_SEGMENTS = ['admin', 'dashboard', 'buyer', 'client', 'vendor', 'settings', 'auth', 'api'];

const ALLOWED_OPEN_GRAPH_TYPES = [
  'website',
  'article',
  'book',
  'profile',
  'music.song',
  'music.album',
  'music.playlist',
  'music.radio_station',
  'video.movie',
  'video.episode',
  'video.tv_show',
  'video.other',
] as const;

const ALLOWED_TWITTER_CARDS = [
  'summary',
  'summary_large_image',
  'player',
  'app',
] as const;

type OpenGraphType = (typeof ALLOWED_OPEN_GRAPH_TYPES)[number];
type TwitterCardType = (typeof ALLOWED_TWITTER_CARDS)[number];

export type KodeSeoData = {
  title?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | string[] | null;
  canonicalUrl?: string | null;
  robots?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: string | null;
  twitterCard?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
  schemaJson?: unknown;
  _blocks?: unknown;
};

export interface SeoOverrides {
  title?: string;
  metaDescription?: string;
  metaKeywords?: string | string[];
  robots?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: OpenGraphType;
  twitterCard?: TwitterCardType;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  schemaJson?: Record<string, unknown>;
}

export type SeoMetadataIssue = {
  field: 'canonicalUrl' | 'robots' | 'ogType' | 'twitterCard' | 'schemaJson';
  rawValue: string;
  reason: string;
};

type NormalizeSeoOptions = {
  fallbackCanonicalPath?: string;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeKeywords(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    const keywords = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
    return keywords.length > 0 ? keywords : undefined;
  }

  return normalizeString(value);
}

function canonicalUrlForPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, CANONICAL_SITE_URL);
  url.protocol = 'https:';
  url.host = CANONICAL_HOST;
  url.hash = '';
  return url.toString();
}

function normalizeCanonicalUrl(
  value: unknown,
  issues: SeoMetadataIssue[],
  fallbackCanonicalPath?: string,
): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw, CANONICAL_SITE_URL);
  } catch {
    issues.push({ field: 'canonicalUrl', rawValue: raw, reason: 'invalid_url' });
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    issues.push({ field: 'canonicalUrl', rawValue: raw, reason: 'unsupported_protocol' });
    return undefined;
  }

  if (parsed.hostname === CANONICAL_WWW_HOST) {
    parsed.hostname = CANONICAL_HOST;
  }

  if (parsed.hostname !== CANONICAL_HOST) {
    issues.push({ field: 'canonicalUrl', rawValue: raw, reason: 'external_domain' });
    return undefined;
  }

  parsed.protocol = 'https:';
  parsed.hash = '';

  const fallbackPath = fallbackCanonicalPath ? normalizePathname(fallbackCanonicalPath) : null;
  if (fallbackPath && fallbackPath !== '/' && parsed.pathname === '/') {
    return canonicalUrlForPath(fallbackPath);
  }

  return parsed.toString();
}

function normalizeRobots(value: unknown, issues: SeoMetadataIssue[]): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;

  const normalized = raw.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();

  if (/[<>{}\r\n]/.test(raw) || /\b(?:user-agent|disallow|allow|sitemap):/.test(lower)) {
    issues.push({ field: 'robots', rawValue: raw, reason: 'invalid_meta_robots_directive' });
    return undefined;
  }

  if (!/^[a-z0-9\s,._:;+=\-\/]+$/i.test(normalized)) {
    issues.push({ field: 'robots', rawValue: raw, reason: 'unsafe_characters' });
    return undefined;
  }

  return normalized;
}

function normalizeOpenGraphType(value: unknown, issues: SeoMetadataIssue[]): OpenGraphType | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if ((ALLOWED_OPEN_GRAPH_TYPES as readonly string[]).includes(normalized)) {
    return normalized as OpenGraphType;
  }

  issues.push({ field: 'ogType', rawValue: raw, reason: 'unsupported_open_graph_type' });
  return undefined;
}

function normalizeTwitterCard(value: unknown, issues: SeoMetadataIssue[]): TwitterCardType | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if ((ALLOWED_TWITTER_CARDS as readonly string[]).includes(normalized)) {
    return normalized as TwitterCardType;
  }

  issues.push({ field: 'twitterCard', rawValue: raw, reason: 'unsupported_twitter_card' });
  return undefined;
}

function normalizeSchemaJson(value: unknown, issues: SeoMetadataIssue[]): Record<string, unknown> | undefined {
  if (!value) return undefined;

  if (typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ field: 'schemaJson', rawValue: String(value), reason: 'schema_not_object' });
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _blocks: _, ...schema } = value as Record<string, unknown>;
  return Object.keys(schema).length > 0 ? schema : undefined;
}

export function normalizePathname(pathname: string): string {
  const normalized = pathname.trim().replace(/\/+/g, '/');
  if (!normalized || normalized === '/') return '/';
  return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

export function isPrivateSeoPath(pathname: string): boolean {
  const [firstSegment] = normalizePathname(pathname).split('/').filter(Boolean);
  return Boolean(firstSegment && PRIVATE_ROUTE_SEGMENTS.includes(firstSegment));
}

export function normalizeSeoOverrides(
  rawData: KodeSeoData | SeoOverrides | null | undefined,
  options: NormalizeSeoOptions = {},
): { seo: SeoOverrides; issues: SeoMetadataIssue[] } {
  if (!rawData) return { seo: {}, issues: [] };

  const issues: SeoMetadataIssue[] = [];
  const seo: SeoOverrides = {};

  const title = normalizeString(rawData.title);
  const metaDescription = normalizeString(rawData.metaDescription);
  const metaKeywords = normalizeKeywords(rawData.metaKeywords);
  const robots = normalizeRobots(rawData.robots, issues);
  const canonicalUrl = normalizeCanonicalUrl(rawData.canonicalUrl, issues, options.fallbackCanonicalPath);
  const ogTitle = normalizeString(rawData.ogTitle);
  const ogDescription = normalizeString(rawData.ogDescription);
  const ogImage = normalizeString(rawData.ogImage);
  const ogType = normalizeOpenGraphType(rawData.ogType, issues);
  const twitterCard = normalizeTwitterCard(rawData.twitterCard, issues);
  const twitterTitle = normalizeString(rawData.twitterTitle);
  const twitterDescription = normalizeString(rawData.twitterDescription);
  const twitterImage = normalizeString(rawData.twitterImage);
  const schemaJson = normalizeSchemaJson(rawData.schemaJson, issues);

  if (title) seo.title = title;
  if (metaDescription) seo.metaDescription = metaDescription;
  if (metaKeywords) seo.metaKeywords = metaKeywords;
  if (robots) seo.robots = robots;
  if (canonicalUrl) seo.canonicalUrl = canonicalUrl;
  if (ogTitle) seo.ogTitle = ogTitle;
  if (ogDescription) seo.ogDescription = ogDescription;
  if (ogImage) seo.ogImage = ogImage;
  if (ogType) seo.ogType = ogType;
  if (twitterCard) seo.twitterCard = twitterCard;
  if (twitterTitle) seo.twitterTitle = twitterTitle;
  if (twitterDescription) seo.twitterDescription = twitterDescription;
  if (twitterImage) seo.twitterImage = twitterImage;
  if (schemaJson) seo.schemaJson = schemaJson;

  return { seo, issues };
}

async function logSeoMetadataIssues(pathname: string, issues: SeoMetadataIssue[], source: 'kodeMetadata' | 'getSeoOverrides'): Promise<void> {
  await Promise.all(
    issues.map((issue) =>
      logInvalidSeoMetadata({
        pathname,
        field: issue.field,
        rawValue: issue.rawValue,
        source,
        reason: issue.reason,
      }),
    ),
  );
}

function getKodeSeoConfig(): { siteId: string; apiBase: string } {
  return {
    siteId: normalizeString(process.env.NEXT_PUBLIC_KODE_SITE_ID) ?? DEFAULT_KODE_SITE_ID,
    apiBase: normalizeString(process.env.KODE_API_BASE) ?? DEFAULT_KODE_API_BASE,
  };
}

export async function fetchKodeSeoOverrides(pathname: string): Promise<KodeSeoData | null> {
  const { siteId, apiBase } = getKodeSeoConfig();

  try {
    const response = await fetch(
      `${apiBase}/api/v1/seo/${siteId}?page=${encodeURIComponent(pathname)}`,
      {
        next: { revalidate: 60 },
        headers: { 'x-kode01-integration': 'next-app-router' },
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: KodeSeoData | null };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export async function getSeoOverrides(
  pathname: string,
  options: NormalizeSeoOptions = {},
): Promise<SeoOverrides> {
  const normalizedPathname = normalizePathname(pathname);
  const data = await fetchKodeSeoOverrides(normalizedPathname);
  const { seo, issues } = normalizeSeoOverrides(data, options);

  if (issues.length > 0) {
    void logSeoMetadataIssues(normalizedPathname, issues, 'getSeoOverrides');
  }

  return seo;
}

export function buildSeoPathname(
  routePattern: string,
  params?: Record<string, string | undefined>,
): string {
  const withoutLocale = routePattern === '/[locale]'
    ? '/'
    : routePattern.replace('/[locale]', '') || '/';
  const replaced = withoutLocale.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const value = params?.[key];
    return value ? encodeURIComponent(value) : '';
  });
  return normalizePathname(replaced);
}

export function buildCanonicalPathname(
  routePattern: string,
  params?: Record<string, string | undefined>,
): string {
  const replaced = routePattern.replace(/\[([^\]]+)\]/g, (_, key: string) => {
    const value = params?.[key];
    return value ? encodeURIComponent(value) : '';
  });
  const path = normalizePathname(replaced);

  if (path.includes('(') || path.includes(')')) {
    return normalizePathname(path.replace(/\/\([^/]+\)/g, ''));
  }

  const locale = normalizeString(params?.locale);
  if (locale && !path.startsWith(`/${locale}`)) {
    return normalizePathname(`/${locale}${path === '/' ? '' : path}`);
  }

  return path;
}

function metadataTitleToString(title: Metadata['title']): string | undefined {
  if (!title) return undefined;
  if (typeof title === 'string') return title;
  if (title instanceof String) return title.toString();
  if (typeof title === 'object' && 'default' in title && typeof title.default === 'string') {
    return title.default;
  }
  return undefined;
}

function metadataCanonicalToString(canonical: unknown): string | undefined {
  if (!canonical) return undefined;
  if (typeof canonical === 'string') return canonical;
  if (canonical instanceof URL) return canonical.toString();
  if (typeof canonical === 'object' && 'url' in canonical) {
    const value = (canonical as { url?: unknown }).url;
    if (typeof value === 'string') return value;
    if (value instanceof URL) return value.toString();
  }
  return undefined;
}

export async function applySeoMetadata(
  base: Metadata,
  routePattern: string,
  params?: Record<string, string | undefined>,
): Promise<Metadata> {
  const seoPathname = buildSeoPathname(routePattern, params);
  const fallbackCanonicalPath = buildCanonicalPathname(routePattern, params);
  const privatePath = isPrivateSeoPath(seoPathname);
  const seo = await getSeoOverrides(seoPathname, { fallbackCanonicalPath });
  const baseCanonical = metadataCanonicalToString(base.alternates?.canonical);
  const normalizedBaseCanonical = normalizeCanonicalUrl(baseCanonical, [], fallbackCanonicalPath);
  const fallbackCanonicalUrl = canonicalUrlForPath(fallbackCanonicalPath);
  const canonicalUrl = seo.canonicalUrl ?? normalizedBaseCanonical ?? fallbackCanonicalUrl;
  const baseOg = (base.openGraph ?? {}) as Record<string, unknown>;
  const baseTwitter = (base.twitter ?? {}) as Record<string, unknown>;
  const normalizedBaseTitle = metadataTitleToString(base.title);
  const normalizedBaseDescription = normalizeString(base.description);
  const title = seo.title ?? normalizedBaseTitle;
  const description = seo.metaDescription ?? normalizedBaseDescription;
  const robots = seo.robots ?? base.robots ?? (privatePath ? 'noindex, nofollow' : 'index, follow');

  return {
    ...base,
    title,
    description,
    keywords: seo.metaKeywords ?? base.keywords,
    robots,
    alternates: {
      ...base.alternates,
      canonical: canonicalUrl,
    },
    openGraph: {
      ...base.openGraph,
      title: seo.ogTitle ?? seo.title ?? (baseOg.title as string | undefined) ?? title,
      description:
        seo.ogDescription ??
        seo.metaDescription ??
        (baseOg.description as string | undefined) ??
        description,
      url: (baseOg.url as string | undefined) ?? canonicalUrl,
      images: seo.ogImage ? [{ url: seo.ogImage }] : (baseOg.images as never),
      type: seo.ogType ?? (baseOg.type as OpenGraphType | undefined) ?? 'website',
    } as Metadata['openGraph'],
    twitter: {
      ...base.twitter,
      card: seo.twitterCard ?? (baseTwitter.card as TwitterCardType | undefined) ?? 'summary_large_image',
      title:
        seo.twitterTitle ??
        seo.ogTitle ??
        seo.title ??
        (baseTwitter.title as string | undefined) ??
        (baseOg.title as string | undefined) ??
        title,
      description:
        seo.twitterDescription ??
        seo.ogDescription ??
        seo.metaDescription ??
        (baseTwitter.description as string | undefined) ??
        (baseOg.description as string | undefined) ??
        description,
      images: seo.twitterImage
        ? [seo.twitterImage]
        : seo.ogImage
          ? [seo.ogImage]
          : (baseTwitter.images as never),
    } as Metadata['twitter'],
  };
}

export function kodeMetadata(path: string) {
  return async (): Promise<Metadata> => {
    return applySeoMetadata({}, path);
  };
}

export async function KodeJsonLd({ path }: { path: string }) {
  const seo = await getSeoOverrides(path);
  if (!seo.schemaJson) return null;
  return React.createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: serializeJsonForScriptTag(seo.schemaJson) },
  });
}
