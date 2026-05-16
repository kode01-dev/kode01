import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getPublishedRecapPostsPage } from '@/features/ai-recap/server/repository';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

const querySchema = z.object({
  locale: z.enum(['en', 'fr']).default('en'),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
      { status: 400, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  try {
    const { locale, limit, offset, sort } = parsed.data;
    const { data: items, total } = await getPublishedRecapPostsPage({
      locale,
      limit,
      offset,
      sort,
    });

    const hasMore = offset + items.length < total;
    const nextOffset = hasMore ? offset + items.length : null;

    return NextResponse.json(
      {
        items,
        total,
        hasMore,
        nextOffset,
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('News list GET error:', error);
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
