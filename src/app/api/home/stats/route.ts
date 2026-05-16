import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseAdminEnvConfigured, isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { createPublicServerClient } from '@/lib/supabase/server-public';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=43200',
};

function safeCount(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

type ScalarCountResult = {
  data: number | null;
  error: { message: string } | null;
};

type ProductSellerRow = {
  seller_id: string | null;
};

const PRODUCTS_PAGE_SIZE = 1000;

function resolveCount(source: string, result: CountResult): number {
  if (result.error) {
    console.error(`Home stats source failed (${source}):`, result.error.message);
    return 0;
  }

  return safeCount(result.count);
}

function resolveScalarCount(source: string, result: ScalarCountResult): number {
  if (result.error) {
    console.error(`Home stats source failed (${source}):`, result.error.message);
    return 0;
  }

  return safeCount(result.data);
}

function createHomeStatsReadClient() {
  if (isSupabaseAdminEnvConfigured()) {
    try {
      return createAdminClient();
    } catch (error) {
      console.error('Home stats admin client unavailable, falling back to public client:', error);
    }
  }

  return createPublicServerClient();
}

async function countPublishedSellers(supabase: ReturnType<typeof createHomeStatsReadClient>): Promise<number> {
  const sellerIds = new Set<string>();
  let from = 0;

  while (true) {
    const to = from + PRODUCTS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('products')
      .select('seller_id')
      .eq('status', 'published')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Home stats published seller fallback failed:', error.message);
      return sellerIds.size;
    }

    const rows = (data ?? []) as ProductSellerRow[];
    for (const row of rows) {
      if (row?.seller_id) {
        sellerIds.add(row.seller_id);
      }
    }

    if (rows.length < PRODUCTS_PAGE_SIZE) {
      break;
    }

    from += PRODUCTS_PAGE_SIZE;
  }

  return sellerIds.size;
}

async function resolveCreatorsCount(
  result: CountResult,
  supabase: ReturnType<typeof createHomeStatsReadClient>,
): Promise<number> {
  const profilesCount = resolveCount('profiles', result);
  if (!result.error && profilesCount > 0) {
    return profilesCount;
  }

  const publishedSellersCount = await countPublishedSellers(supabase);
  return publishedSellersCount || profilesCount;
}

export async function GET() {
  try {
    if (!isSupabasePublicEnvConfigured() && !isSupabaseAdminEnvConfigured() && process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        {
          productsAndArticles: 0,
          creators: 0,
          totalSales: 0,
        },
        { headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const supabase = createHomeStatsReadClient();

    const [
      productsResult,
      articlesResult,
      creatorsResult,
      totalSalesResult,
    ] = await Promise.all([
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published'),
      supabase
        .from('ai_recap_posts')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'seller'),
      supabase.rpc('get_total_sales_count'),
    ]);

    const products = resolveCount('products', productsResult);
    const articles = resolveCount('ai_recap_posts', articlesResult);
    const creators = await resolveCreatorsCount(creatorsResult, supabase);
    const totalSales = resolveScalarCount('get_total_sales_count', totalSalesResult);

    return NextResponse.json(
      {
        productsAndArticles: products + articles,
        creators,
        totalSales,
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('Home stats GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
