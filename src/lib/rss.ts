export const RSS_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const DEFAULT_RSS_DATE = new Date(0).toUTCString();

const IMAGE_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export type RssBuildResult = {
  xml: string;
  lastBuildDate: string;
  selfUrl: string;
};

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function toRssDate(value: string | null | undefined): string {
  if (!value) return DEFAULT_RSS_DATE;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return DEFAULT_RSS_DATE;
  return parsed.toUTCString();
}

export function toAbsoluteUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
}

export function inferImageMimeType(url: string, fallback = 'image/jpeg'): string {
  try {
    const parsed = new URL(url, 'https://kode01.invalid');
    const extension = parsed.pathname.split('.').pop()?.toLowerCase() ?? '';
    return IMAGE_MIME_TYPES_BY_EXTENSION[extension] ?? fallback;
  } catch {
    return fallback;
  }
}

export function buildMediaContentTag(url: string, mimeType: string): string {
  return `<media:content url="${escapeXml(url)}" medium="image" type="${escapeXml(mimeType)}" />`;
}
