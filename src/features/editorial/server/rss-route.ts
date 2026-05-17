import { NextResponse } from 'next/server';

import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import { buildEditorialRssDocument } from '@/features/editorial/server/rss';
import type { EditorialLocale } from '@/features/editorial/types';
import { getAppBaseUrl } from '@/lib/env/server';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';
import { buildRssResponse, PUBLIC_RSS_CACHE_HEADERS } from '@/lib/rss-response';

export function isEditorialRssLocale(value: string): value is EditorialLocale {
  return value === 'en' || value === 'fr';
}

export function invalidEditorialRssLocaleResponse(details: Record<string, string[] | undefined> = {
  locale: ['Invalid enum value. Expected en | fr'],
}) {
  return NextResponse.json(
    { error: 'Validation error', details },
    { status: 400, headers: PUBLIC_RSS_CACHE_HEADERS },
  );
}

export async function getEditorialRssResponse(args: {
  request: Request;
  locale: EditorialLocale;
  feedPath: string;
}) {
  try {
    const { data } = await getPublishedEditorialPosts({
      locale: args.locale,
      page: 1,
      pageSize: 10,
      sort: 'newest',
    });
    const posts = data.slice(0, 10);
    const baseUrl = getAppBaseUrl();
    const document = buildEditorialRssDocument({
      locale: args.locale,
      baseUrl,
      feedPath: args.feedPath,
      posts,
    });

    return buildRssResponse({
      request: args.request,
      xml: document.xml,
      selfUrl: document.selfUrl,
      lastBuildDate: document.lastBuildDate,
    });
  } catch (error) {
    console.error('Blog RSS GET error:', error);
    if (isTransientDbUnavailableError(error)) {
      return NextResponse.json(
        createDbUnavailableApiPayload(),
        { status: DB_UNAVAILABLE_STATUS, headers: DB_UNAVAILABLE_RESPONSE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: PUBLIC_RSS_CACHE_HEADERS },
    );
  }
}
