import { NextResponse } from 'next/server';

import { getPublishedRecapPostsPage } from '@/features/ai-recap/server/repository';
import { buildAiNewsRssDocument } from '@/features/ai-recap/server/rss';
import type { RecapLocale } from '@/features/ai-recap/types';
import { getAppBaseUrl } from '@/lib/env/server';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';
import { buildRssResponse, PUBLIC_RSS_CACHE_HEADERS } from '@/lib/rss-response';

export function isAiNewsRssLocale(value: string): value is RecapLocale {
  return value === 'en' || value === 'fr';
}

export function invalidAiNewsRssLocaleResponse(details: Record<string, string[] | undefined> = {
  locale: ['Invalid enum value. Expected en | fr'],
}) {
  return NextResponse.json(
    { error: 'Validation error', details },
    { status: 400, headers: PUBLIC_RSS_CACHE_HEADERS },
  );
}

export async function getAiNewsRssResponse(args: {
  request: Request;
  locale: RecapLocale;
  feedPath: string;
}) {
  try {
    const { data } = await getPublishedRecapPostsPage({
      locale: args.locale,
      limit: 10,
      offset: 0,
      sort: 'newest',
    });
    const posts = data.slice(0, 10);
    const baseUrl = getAppBaseUrl();
    const document = buildAiNewsRssDocument({
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
    console.error('News RSS GET error:', error);
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
