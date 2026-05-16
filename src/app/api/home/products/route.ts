import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseAdminEnvConfigured, isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600',
};

const PRODUCT_SELECT_WITH_RELATIONS = `
  id,
  slug,
  title,
  price,
  content_locales,
  content_source_locale,
  cover_image_url,
  category,
  category_ref:product_categories!products_category_id_fkey (
    slug,
    name_en,
    name_fr
  ),
  tags,
  created_at,
  is_bundle,
  profiles:profile_marketplace_data!seller_id (
    display_name,
    shop_name
  )
`;

const PRODUCT_SELECT_COMPAT = `
  id,
  slug,
  title,
  price,
  cover_image_url,
  category,
  tags,
  created_at
`;

type ProductRow = {
  id: string;
  slug: string | null;
  title: string | null;
  price: number | string | null;
  content_locales: string[] | null;
  content_source_locale: string | null;
  cover_image_url: string | null;
  category: string | null;
  category_ref:
    | {
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }
    | Array<{
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }>
    | null;
  tags: unknown;
  created_at: string | null;
  is_bundle: boolean | null;
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

type ProductReviewStatsRow = {
  product_id: string;
  average_rating: number | string | null;
  reviews_count: number | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toLocaleCodes(value: unknown): Array<'fr' | 'en'> | null {
  if (!Array.isArray(value)) return null;

  const locales = value.filter((entry): entry is 'fr' | 'en' => entry === 'fr' || entry === 'en');
  return locales.length > 0 ? locales : null;
}

function toSourceLocale(value: unknown): 'fr' | 'en' | null {
  return value === 'fr' || value === 'en' ? value : null;
}

function toCategoryRef(
  value: ProductRow['category_ref'],
): { slug: string; name_en: string | null; name_fr: string | null } | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row.slug !== 'string' || !row.slug) return null;
  return {
    slug: row.slug,
    name_en: row.name_en ?? null,
    name_fr: row.name_fr ?? null,
  };
}

function toSeller(
  value: ProductRow['profiles'],
): { display_name: string | null; shop_name: string | null } | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return null;
  return {
    display_name: row.display_name ?? null,
    shop_name: row.shop_name ?? null,
  };
}

function toStringTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isProductSelectCompatibilityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
  const haystack = `${message} ${details}`.toLowerCase();

  if (code === '42703') {
    return [
      'content_locales',
      'content_source_locale',
      'is_bundle',
    ].some((column) => haystack.includes(column));
  }

  return ['42p01', 'pgrst200', 'pgrst201', 'pgrst205'].includes(code.toLowerCase())
    || haystack.includes('profile_marketplace_data')
    || haystack.includes('product_categories')
    || haystack.includes('products_category_id_fkey');
}

function isMissingReviewStatsRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
  const haystack = `${message} ${details}`.toLowerCase();
  return ['42p01', 'pgrst200', 'pgrst205'].includes(code.toLowerCase())
    || haystack.includes('product_review_stats');
}

async function createProductsReadClient() {
  if (!isSupabasePublicEnvConfigured() && process.env.NODE_ENV !== 'production') {
    return null;
  }

  try {
    return isSupabaseAdminEnvConfigured() ? createAdminClient() : await createServerClient();
  } catch (error) {
    console.warn('Home products API: falling back to anon Supabase client.', error);
    return createServerClient();
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const { limit } = parsed.data;
    const supabase = await createProductsReadClient();
    if (!supabase) {
      return NextResponse.json({ items: [] }, { headers: PUBLIC_CACHE_HEADERS });
    }

    const productsResult = await supabase
      .from('products')
      .select(PRODUCT_SELECT_WITH_RELATIONS)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);

    let productData = productsResult.data as ProductRow[] | null;
    let productsError = productsResult.error;

    if (productsError && isProductSelectCompatibilityError(productsError)) {
      const fallbackResult = await supabase
        .from('products')
        .select(PRODUCT_SELECT_COMPAT)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit);
      productData = fallbackResult.data as unknown as ProductRow[] | null;
      productsError = fallbackResult.error;
    }

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
    }

    const rows = (productData ?? []) as ProductRow[];
    const productIds = rows.map((row) => row.id);
    const reviewStatsByProductId = new Map<string, { average_rating: number | null; reviews_count: number }>();

    if (productIds.length > 0) {
      const { data: reviewStatsRows, error: reviewStatsError } = await supabase
        .from('product_review_stats')
        .select('product_id, average_rating, reviews_count')
        .in('product_id', productIds);

      if (reviewStatsError) {
        if (!isMissingReviewStatsRelation(reviewStatsError)) {
          return NextResponse.json({ error: reviewStatsError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
        }
        console.warn('Home products API: product_review_stats unavailable, returning products without review stats.', reviewStatsError);
      }

      (reviewStatsRows ?? []).forEach((entry) => {
        const row = entry as ProductReviewStatsRow;
        const average = row.average_rating === null ? null : toNumber(row.average_rating);
        reviewStatsByProductId.set(row.product_id, {
          average_rating: average === null || !Number.isFinite(average) ? null : average,
          reviews_count: typeof row.reviews_count === 'number' && Number.isFinite(row.reviews_count)
            ? Math.max(0, Math.floor(row.reviews_count))
            : 0,
        });
      });
    }

    return NextResponse.json(
      {
        items: rows.map((row) => ({
          id: row.id,
          slug: row.slug ?? row.id,
          title: row.title ?? 'Untitled',
          price: toNumber(row.price),
          content_locales: toLocaleCodes(row.content_locales),
          content_source_locale: toSourceLocale(row.content_source_locale),
          cover_image_url: row.cover_image_url,
          category: row.category,
          category_ref: toCategoryRef(row.category_ref),
          tags: toStringTags(row.tags),
          createdAt: row.created_at ?? new Date(0).toISOString(),
          isBundle: Boolean(row.is_bundle),
          seller: toSeller(row.profiles),
          average_rating: reviewStatsByProductId.get(row.id)?.average_rating ?? null,
          reviews_count: reviewStatsByProductId.get(row.id)?.reviews_count ?? 0,
        })),
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('Home products GET error:', error);
    if (isTransientDbUnavailableError(error)) {
      return NextResponse.json(
        createDbUnavailableApiPayload(),
        { status: DB_UNAVAILABLE_STATUS, headers: DB_UNAVAILABLE_RESPONSE_HEADERS },
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
