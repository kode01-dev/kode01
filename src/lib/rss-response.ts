import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';
export const PUBLIC_RSS_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

function createEtag(xml: string): string {
  return `"rss-${createHash('sha256').update(xml).digest('hex')}"`;
}

function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag);
}

function isNotModifiedByDate(ifModifiedSince: string | null, lastBuildDate: string): boolean {
  if (!ifModifiedSince) return false;
  const since = new Date(ifModifiedSince);
  const lastModified = new Date(lastBuildDate);
  if (Number.isNaN(since.getTime()) || Number.isNaN(lastModified.getTime())) return false;
  return since.getTime() >= lastModified.getTime();
}

export function buildRssResponse(args: {
  request: Request;
  xml: string;
  selfUrl: string;
  lastBuildDate: string;
}): NextResponse {
  const etag = createEtag(args.xml);
  const headers = {
    ...PUBLIC_RSS_CACHE_HEADERS,
    'Content-Type': RSS_CONTENT_TYPE,
    'X-Content-Type-Options': 'nosniff',
    'Last-Modified': args.lastBuildDate,
    ETag: etag,
    Link: `<${args.selfUrl}>; rel="self"; type="application/rss+xml"`,
  };

  if (
    etagMatches(args.request.headers.get('if-none-match'), etag)
    || isNotModifiedByDate(args.request.headers.get('if-modified-since'), args.lastBuildDate)
  ) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(args.xml, { status: 200, headers });
}
