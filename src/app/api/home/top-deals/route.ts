import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { createPublicServerClient } from '@/lib/supabase/server-public';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(6),
  days: z.coerce.number().int().min(1).max(90).default(7),
});

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=180, stale-while-revalidate=900',
};

type TopDealsAggregateRow = {
  product_id: string;
  sales_count: number | string | null;
};

type ProductRow = {
  id: string;
  slug: string | null;
  title: string | null;
  price: number | string | null;
  is_pwyw: boolean | null;
  min_price: number | string | null;
  cover_image_url: string | null;
  tags: unknown;
  created_at: string | null;
  is_bundle: boolean | null;
  content_locales: string[] | null;
  content_source_locale: string | null;
  profiles:
    | {
      display_name: string | null;
      shop_name: string | null;
    }
    | Array<{
      display_name: string | null;
      shop_name: string | null;
    }>
    | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getSellerName(profile: ProductRow['profiles']): string {
  if (!profile) return 'Anonymous';
  const row = Array.isArray(profile) ? profile[0] : profile;
  if (!row) return 'Anonymous';
  return row.shop_name || row.display_name || 'Anonymous';
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toPositiveInteger(value: number | string | null | undefined): number {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function isRpcMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const normalizedMessage = message.toLowerCase();
  return code === 'PGRST202'
    || (normalizedMessage.includes('function') && normalizedMessage.includes('not found'));
}

function isRpcPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const normalizedMessage = message.toLowerCase();
  return code === '42501' || normalizedMessage.includes('permission denied');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      days: url.searchParams.get('days') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const { limit, days } = parsed.data;
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    if (!isSupabasePublicEnvConfigured() && process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        {
          items: [],
          meta: {
            limit,
            days,
            since: sinceIso,
          },
        },
        { headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const supabase = createPublicServerClient();

    const salesByProduct = new Map<string, number>();
    const aggregateLimit = Math.max(limit * 8, 64);

    const { data: aggregateRows, error: aggregateError } = await supabase.rpc('list_top_deals', {
      p_since: sinceIso,
      p_limit: aggregateLimit,
    });

    if (
      aggregateError
      && !isRpcMissingFunctionError(aggregateError)
      && !isRpcPermissionError(aggregateError)
    ) {
      return NextResponse.json({ error: aggregateError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
    }

    if (Array.isArray(aggregateRows) && aggregateRows.length > 0) {
      for (const row of aggregateRows as TopDealsAggregateRow[]) {
        if (!row?.product_id) continue;
        const count = toPositiveInteger(row.sales_count);
        if (count <= 0) continue;
        salesByProduct.set(row.product_id, count);
      }
    }

    const rankedProductIds = [...salesByProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([productId]) => productId);

    const candidateIds = rankedProductIds.slice(0, Math.max(limit * 4, 24));
    let rankedProducts: ProductRow[] = [];

    if (candidateIds.length > 0) {
      const { data: productData, error: productsError } = await supabase
        .from('products')
        .select(
          `
            id,
            slug,
            title,
            price,
            is_pwyw,
            min_price,
            cover_image_url,
            tags,
            created_at,
            is_bundle,
            content_locales,
            content_source_locale,
            profiles!seller_id (
              display_name,
              shop_name
            )
          `,
        )
        .eq('status', 'published')
        .in('id', candidateIds);

      if (productsError) {
        return NextResponse.json({ error: productsError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
      }

      rankedProducts = (productData ?? []) as ProductRow[];
    }

    const rankedItems = rankedProducts
      .filter((row) => Boolean(row.slug))
      .map((row) => {
        const salesCount = salesByProduct.get(row.id) ?? 0;
        return {
          id: row.id,
          slug: row.slug as string,
          title: row.title || 'Untitled',
          price: toNumber(row.price),
          is_pwyw: Boolean(row.is_pwyw),
          min_price: toNumber(row.min_price),
          sales_count: salesCount,
          cover_image_url: row.cover_image_url,
          seller_name: getSellerName(row.profiles),
          tags: normalizeTags(row.tags),
          createdAt: row.created_at ?? new Date(0).toISOString(),
          isBundle: Boolean(row.is_bundle),
          content_locales: Array.isArray(row.content_locales)
            ? row.content_locales.filter((locale): locale is 'fr' | 'en' => locale === 'fr' || locale === 'en')
            : null,
          content_source_locale: row.content_source_locale === 'fr' || row.content_source_locale === 'en'
            ? row.content_source_locale
            : null,
        };
      })
      .sort((a, b) => b.sales_count - a.sales_count);

    const selectedIds = new Set(rankedItems.map((item) => item.id));
    const missingCount = Math.max(0, limit - rankedItems.length);
    let fallbackItems: typeof rankedItems = [];

    if (missingCount > 0) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('products')
        .select(
          `
            id,
            slug,
            title,
            price,
            is_pwyw,
            min_price,
            cover_image_url,
            tags,
            created_at,
            is_bundle,
            content_locales,
            content_source_locale,
            profiles!seller_id (
              display_name,
              shop_name
            )
          `,
        )
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(Math.max(24, missingCount * 4));

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
      }

      fallbackItems = ((fallbackData ?? []) as ProductRow[])
        .filter((row) => Boolean(row.slug) && !selectedIds.has(row.id))
        .slice(0, missingCount)
        .map((row) => ({
          id: row.id,
          slug: row.slug as string,
          title: row.title || 'Untitled',
          price: toNumber(row.price),
          is_pwyw: Boolean(row.is_pwyw),
          min_price: toNumber(row.min_price),
          sales_count: salesByProduct.get(row.id) ?? 0,
          cover_image_url: row.cover_image_url,
          seller_name: getSellerName(row.profiles),
          tags: normalizeTags(row.tags),
          createdAt: row.created_at ?? new Date(0).toISOString(),
          isBundle: Boolean(row.is_bundle),
          content_locales: Array.isArray(row.content_locales)
            ? row.content_locales.filter((locale): locale is 'fr' | 'en' => locale === 'fr' || locale === 'en')
            : null,
          content_source_locale: row.content_source_locale === 'fr' || row.content_source_locale === 'en'
            ? row.content_source_locale
            : null,
        }));
    }

    return NextResponse.json(
      {
        items: [...rankedItems, ...fallbackItems].slice(0, limit),
        meta: {
          limit,
          days,
          since: sinceIso,
        },
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('Top deals GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
