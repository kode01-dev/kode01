import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import { buildEditorialRssXml } from '@/features/editorial/server/rss';
import { getAppBaseUrl } from '@/lib/env/server';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

const querySchema = z.object({
  locale: z.enum(['en', 'fr']).default('en'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
      { status: 400, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  try {
    const { locale } = parsed.data;
    const { data } = await getPublishedEditorialPosts({
      locale,
      page: 1,
      pageSize: 10,
      sort: 'newest',
    });
    const posts = data.slice(0, 10);
    const baseUrl = getAppBaseUrl();
    const xml = buildEditorialRssXml({
      locale,
      baseUrl,
      feedPath: `/api/blog/rss?locale=${locale}`,
      posts,
    });

    return new NextResponse(xml, {
      status: 200,
      headers: {
        ...PUBLIC_CACHE_HEADERS,
        'Content-Type': RSS_CONTENT_TYPE,
      },
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
      { status: 500, headers: PUBLIC_CACHE_HEADERS },
    );
  }
}
