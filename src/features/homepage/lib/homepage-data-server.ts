import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseAdminEnvConfigured } from '@/lib/supabase/env';
import { unstable_cache } from 'next/cache';

export type HomeStatsData = {
    productsAndArticles: number;
    creators: number;
    totalSales: number;
};

const HOME_STATS_CACHE_TAG = 'home:stats';
const HOME_PRODUCTS_CACHE_TAG = 'home:products';
const HOME_TOP_DEALS_CACHE_TAG = 'home:top-deals';

const HOME_STATS_REVALIDATE_SECONDS = 300;
const HOME_PRODUCTS_REVALIDATE_SECONDS = 120;
const HOME_TOP_DEALS_REVALIDATE_SECONDS = 120;

async function getHomeStatsUncached(): Promise<HomeStatsData> {
    if (!isSupabaseAdminEnvConfigured() && process.env.NODE_ENV !== 'production') {
        return {
            productsAndArticles: 0,
            creators: 0,
            totalSales: 0,
        };
    }

    const admin = createAdminClient();

    const [
        productsResult,
        articlesResult,
        creatorsResult,
        purchasesResult,
    ] = await Promise.all([
        admin.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        admin.from('ai_recap_posts').select('*', { count: 'exact', head: true }).eq('is_published', true),
        admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'seller'),
        admin.from('purchases').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    ]);

    const products = productsResult.count ?? 0;
    const articles = articlesResult.count ?? 0;
    const creators = creatorsResult.count ?? 0;
    const totalSales = purchasesResult.count ?? 0;

    return {
        productsAndArticles: products + articles,
        creators,
        totalSales,
    };
}

const getHomeStatsCached = unstable_cache(
    async (): Promise<HomeStatsData> => getHomeStatsUncached(),
    [HOME_STATS_CACHE_TAG],
    {
        revalidate: HOME_STATS_REVALIDATE_SECONDS,
        tags: [HOME_STATS_CACHE_TAG],
    },
);

export async function getHomeStatsServer(): Promise<HomeStatsData> {
    return getHomeStatsCached();
}

async function getHomeProductsUncached(limit: number) {
    if (!isSupabaseAdminEnvConfigured() && process.env.NODE_ENV !== 'production') {
        return [];
    }

    const admin = createAdminClient();

    const { data: productData, error: productsError } = await admin
        .from('products')
        .select(`
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
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (productsError) {
        console.error('getHomeProductsServer error:', productsError);
        return [];
    }

    const productIds = (productData ?? []).map(p => p.id);
    const reviewStatsByProductId = new Map<string, { average_rating: number | null, reviews_count: number }>();

    if (productIds.length > 0) {
        const { data: reviewStatsRows } = await admin
            .from('product_review_stats')
            .select('product_id, average_rating, reviews_count')
            .in('product_id', productIds);

        (reviewStatsRows ?? []).forEach((row) => {
            if (row.product_id) {
                reviewStatsByProductId.set(row.product_id, {
                    average_rating: row.average_rating,
                    reviews_count: row.reviews_count ?? 0
                });
            }
        });
    }

    return (productData ?? []).map((p) => {
        const profilesArray = p.profiles as unknown as Array<{ display_name: string | null; shop_name: string | null }> | null;
        const seller = Array.isArray(profilesArray) ? profilesArray[0] : null;

        const categoriesArray = p.category_ref as unknown as Array<{ slug: string; name_en: string | null; name_fr: string | null }> | null;
        const category_ref = Array.isArray(categoriesArray) ? categoriesArray[0] : null;
        
        return {
            id: p.id,
            slug: p.slug ?? p.id,
            title: p.title ?? 'Untitled',
            price: Number(p.price) || 0,
            content_locales: p.content_locales as Array<'fr' | 'en'> | null,
            content_source_locale: p.content_source_locale as 'fr' | 'en' | null,
            cover_image_url: p.cover_image_url,
            category: p.category,
            category_ref: category_ref ? {
                slug: category_ref.slug,
                name_en: category_ref.name_en,
                name_fr: category_ref.name_fr
            } : null,
            tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
            createdAt: p.created_at ?? new Date(0).toISOString(),
            isBundle: Boolean(p.is_bundle),
            seller: seller ? {
                display_name: seller.display_name,
                shop_name: seller.shop_name
            } : null,
            average_rating: reviewStatsByProductId.get(p.id)?.average_rating ?? null,
            reviews_count: reviewStatsByProductId.get(p.id)?.reviews_count ?? 0,
        };
    });
}

const getHomeProductsCached = unstable_cache(
    async (limit: number) => getHomeProductsUncached(limit),
    [HOME_PRODUCTS_CACHE_TAG],
    {
        revalidate: HOME_PRODUCTS_REVALIDATE_SECONDS,
        tags: [HOME_PRODUCTS_CACHE_TAG],
    },
);

export async function getHomeProductsServer(limit: number = 4) {
    const resolvedLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 12) : 4;
    return getHomeProductsCached(resolvedLimit);
}

async function getTopDealsUncached(limit: number, days: number) {
    if (!isSupabaseAdminEnvConfigured() && process.env.NODE_ENV !== 'production') {
        return [];
    }

    const admin = createAdminClient();
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: aggregateRows, error: aggregateError } = await admin.rpc('list_top_deals', {
        p_since: sinceIso,
        p_limit: Math.max(limit * 8, 64),
    });

    if (aggregateError) {
        console.error('getTopDealsServer rpc error:', aggregateError);
        return [];
    }

    const salesByProduct = new Map<string, number>();
    (aggregateRows as Array<{ product_id: string; sales_count: number }> ?? []).forEach((row) => {
        salesByProduct.set(row.product_id, Number(row.sales_count) || 0);
    });

    const candidateIds = (aggregateRows as Array<{ product_id: string }> ?? []).map((row) => row.product_id).slice(0, limit * 4);

    if (candidateIds.length === 0) return [];

    const { data: productData } = await admin
        .from('products')
        .select(`
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
            profiles:profile_marketplace_data!seller_id (
                display_name,
                shop_name
            )
        `)
        .eq('status', 'published')
        .in('id', candidateIds);

    const items = (productData ?? [])
        .filter(row => !!row.slug)
        .map((row) => {
            const profilesArray = row.profiles as unknown as Array<{ display_name: string | null; shop_name: string | null }> | null;
            const seller = Array.isArray(profilesArray) ? profilesArray[0] : null;
            
            return {
                id: row.id,
                slug: row.slug as string,
                title: row.title || 'Untitled',
                price: Number(row.price) || 0,
                is_pwyw: Boolean(row.is_pwyw),
                min_price: Number(row.min_price) || 0,
                sales_count: salesByProduct.get(row.id) ?? 0,
                cover_image_url: row.cover_image_url,
                seller_name: seller?.shop_name || seller?.display_name || 'Anonymous',
                tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
                createdAt: row.created_at ?? new Date(0).toISOString(),
                isBundle: Boolean(row.is_bundle),
                content_locales: row.content_locales as Array<'fr' | 'en'> | null,
                content_source_locale: row.content_source_locale as 'fr' | 'en' | null,
            };
        })
        .sort((a, b) => b.sales_count - a.sales_count);

    return items.slice(0, limit);
}

const getTopDealsCached = unstable_cache(
    async (limit: number, days: number) => getTopDealsUncached(limit, days),
    [HOME_TOP_DEALS_CACHE_TAG],
    {
        revalidate: HOME_TOP_DEALS_REVALIDATE_SECONDS,
        tags: [HOME_TOP_DEALS_CACHE_TAG],
    },
);

export async function getTopDealsServer(limit: number = 6, days: number = 7) {
    const resolvedLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 24) : 6;
    const resolvedDays = Number.isInteger(days) ? Math.min(Math.max(days, 1), 90) : 7;
    return getTopDealsCached(resolvedLimit, resolvedDays);
}
