import { NextResponse } from 'next/server';
import { z } from 'zod';

import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';
import { createPublicServerClient } from '@/lib/supabase/server-public';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=120',
};

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

function normalizeQuery(value: string): string {
  return value
    .replace(/[,%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  if (!PUBLIC_MARKETPLACE_ENABLED) {
    return NextResponse.json({ suggestions: [] }, { headers: PUBLIC_CACHE_HEADERS });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
  });

  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] }, { headers: PUBLIC_CACHE_HEADERS });
  }

  const query = normalizeQuery(parsed.data.q);
  if (!query) {
    return NextResponse.json({ suggestions: [] }, { headers: PUBLIC_CACHE_HEADERS });
  }

  try {
    const supabase = createPublicServerClient();
    const { data, error } = await (supabase as unknown as {
      rpc: (
        fn: string,
        params?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }).rpc('suggest_product_titles', {
      p_query: query,
      p_limit: 5,
    });

    if (error) throw error;

    const suggestions = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .map((row) => {
            const value = (row as { title?: unknown }).title;
            return typeof value === 'string' ? value.trim() : '';
          })
          .filter(Boolean),
      ),
    ).slice(0, 5);

    return NextResponse.json({ suggestions }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Search suggest GET error:', error);
    return NextResponse.json({ suggestions: [] }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
