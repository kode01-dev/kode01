import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';
import { getMarketListDataCached } from '@/features/market/server/list-repository';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

const querySchema = z.object({
  locale: z.string().optional().default('en'),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional().default(''),
  category: z.string().optional().default(''),
  subcategories: z.string().optional().default(''),
  tags: z.string().optional().default(''),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional().default('newest'),
  type: z.enum(['all', 'product', 'bundle']).optional().default('all'),
  includeFacets: z.coerce.boolean().optional().default(true),
  includeTotal: z.coerce.boolean().optional().default(true),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? 'en',
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    search: url.searchParams.get('search') ?? '',
    category: url.searchParams.get('category') ?? '',
    subcategories: url.searchParams.get('subcategories') ?? '',
    tags: url.searchParams.get('tags') ?? '',
    sort: url.searchParams.get('sort') ?? 'newest',
    type: url.searchParams.get('type') ?? 'all',
    includeFacets: url.searchParams.get('includeFacets') ?? undefined,
    includeTotal: url.searchParams.get('includeTotal') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation error',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400, headers: PUBLIC_CACHE_HEADERS },
    );
  }

  try {
    const payload = await getMarketListDataCached(parsed.data);
    return NextResponse.json(payload, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Market list GET error:', error);
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
