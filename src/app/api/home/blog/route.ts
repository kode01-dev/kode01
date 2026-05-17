import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(3),
  locale: z.enum(['en', 'fr']).default('en'),
});

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      locale: url.searchParams.get('locale') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const { limit, locale } = parsed.data;

    const { data } = await getPublishedEditorialPosts({
      locale,
      page: 1,
      pageSize: limit,
      sort: 'newest',
    });

    return NextResponse.json({ items: data }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Home blog GET error:', error);
    if (isTransientDbUnavailableError(error)) {
      return NextResponse.json(
        createDbUnavailableApiPayload(),
        { status: DB_UNAVAILABLE_STATUS, headers: DB_UNAVAILABLE_RESPONSE_HEADERS },
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
