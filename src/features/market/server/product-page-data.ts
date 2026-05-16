import 'server-only';

import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { getBlueprintPublicMetadata } from '@/features/agent-blueprints/server/repository';
import { AGENT_BLUEPRINTS_CATEGORY_SLUG } from '@/features/agent-blueprints/types';
import type {
  AgentBlueprintManifest,
  AgentLicenseType,
} from '@/features/agent-blueprints/types';
import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import {
  inferStatusFromContentMetadata,
  inferStatusFromLocalizedPair,
  mergeApiContentTranslationStatuses,
} from '@/lib/i18n/api-content-status';

interface ReviewProfileRow {
  display_name: string | null;
  shop_name: string | null;
}

interface ProductReviewRow {
  id: string;
  buyer_id: string;
  rating: number;
  comment: string;
  created_at: string;
  profiles: ReviewProfileRow | ReviewProfileRow[] | null;
}

interface ProductReviewStatsRow {
  average_rating: number | string | null;
  reviews_count: number | null;
}

interface ProductCategoryRow {
  slug: string;
  name_en: string | null;
  name_fr: string | null;
}

interface ProductSubcategoryRow {
  slug: string;
  name_en: string | null;
  name_fr: string | null;
}

interface ProductSellerProfileRow {
  id: string;
  display_name: string | null;
  shop_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  created_at: string | null;
}

interface ProductRow {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  content_locales: string[] | null;
  content_source_locale: 'en' | 'fr' | null;
  price: number | string | null;
  is_pwyw: boolean | null;
  min_price: number | string | null;
  category: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  updated_at: string | null;
  profiles: ProductSellerProfileRow | ProductSellerProfileRow[] | null;
  category_ref: ProductCategoryRow | ProductCategoryRow[] | null;
  subcategory_ref: ProductSubcategoryRow | ProductSubcategoryRow[] | null;
  original_price?: number | string | null;
  file_size?: string | null;
  format?: string | null;
  features?: unknown;
  video_url?: string | null;
  gallery_urls?: string[] | null;
}

const PRODUCT_SELECT_BASE = `
    id,
    slug,
    title,
    description,
    content_locales,
    content_source_locale,
    price,
    is_pwyw,
    min_price,
    category,
    tags,
    cover_image_url,
    updated_at,
    profiles:profile_marketplace_data!seller_id (
        id,
        display_name,
        shop_name,
        avatar_url,
        is_verified,
        created_at
    ),
    category_ref:product_categories!products_category_id_fkey (
        slug,
        name_en,
        name_fr
    ),
    subcategory_ref:product_subcategories!products_subcategory_id_fkey (
        slug,
        name_en,
        name_fr
    )
`;

const PRODUCT_SELECT_WITH_OPTIONAL_COLUMNS = `
    ${PRODUCT_SELECT_BASE},
    original_price,
    file_size,
    format,
    features,
    video_url,
    gallery_urls
`;

const OPTIONAL_PRODUCT_COLUMNS = [
  'original_price',
  'file_size',
  'format',
  'features',
  'video_url',
  'gallery_urls',
] as const;

type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
};

function isMissingOptionalProductColumnError(
  error: PostgrestErrorLike | null | undefined,
): boolean {
  if (!error || error.code !== '42703') return false;
  const message = (error.message ?? '').toLowerCase();
  return OPTIONAL_PRODUCT_COLUMNS.some((columnName) => {
    return message.includes(`products.${columnName}`) || message.includes(columnName);
  });
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchProductRow(
  supabase: ReturnType<typeof createPublicServerClient>,
  slug: string,
) {
  type ProductQueryResponse = {
    data: ProductRow | null;
    error: PostgrestErrorLike | null;
  };

  let response = (await supabase
    .from('products')
    .select(PRODUCT_SELECT_WITH_OPTIONAL_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .single()) as unknown as ProductQueryResponse;

  if (isMissingOptionalProductColumnError(response.error)) {
    response = (await supabase
      .from('products')
      .select(PRODUCT_SELECT_BASE)
      .eq('slug', slug)
      .eq('status', 'published')
      .single()) as unknown as ProductQueryResponse;
  }

  return response;
}

function safeTranslate(
  t: Awaited<ReturnType<typeof getTranslations>>,
  key: string,
  fallback: string,
): string {
  try {
    return t(key as never);
  } catch {
    return fallback;
  }
}

function resolveMarketMetaValue(
  rawValue: unknown,
  tMarket: Awaited<ReturnType<typeof getTranslations>>,
  fallbackKey: string,
  fallback: string,
): string {
  if (typeof rawValue === 'string') {
    const trimmedValue = rawValue.trim();
    if (trimmedValue) {
      if (trimmedValue.startsWith('market.meta.')) {
        return safeTranslate(tMarket, trimmedValue.replace(/^market\./, ''), fallback);
      }
      return trimmedValue;
    }
  }

  return safeTranslate(tMarket, fallbackKey, fallback);
}

export async function getProductDataUncached(slug: string, locale: string) {
  const supabase = createPublicServerClient();
  const tMarket = await getTranslations({ locale, namespace: 'market' });

  const { data: product, error } = await fetchProductRow(supabase, slug);
  if (error || !product) return null;

  const price = toNumber(product.price);
  const minPrice = Math.max(0, toNumber(product.min_price));
  const originalPrice = toNullableNumber(product.original_price);
  const productFeatures = Array.isArray(product.features)
    ? product.features.filter((feature): feature is string => typeof feature === 'string')
    : [];
  const fileSize = resolveMarketMetaValue(product.file_size, tMarket, 'meta.not_available', 'N/A');
  const productFormat = resolveMarketMetaValue(
    product.format,
    tMarket,
    'meta.format_digital_default',
    'Digital',
  );

  const adminSupabase = createAdminClient();

  const [salesResult, reviewStatsResult, reviewRowsResult, variantsResult] = await Promise.all([
    adminSupabase
      .from('purchases')
      .select('*', { count: 'planned', head: true })
      .eq('product_id', product.id)
      .eq('status', 'completed'),
    supabase
      .from('product_review_stats')
      .select('average_rating, reviews_count')
      .eq('product_id', product.id)
      .maybeSingle(),
    supabase
      .from('product_reviews')
      .select(`
        id,
        buyer_id,
        rating,
        comment,
        created_at,
        profiles:profile_marketplace_data!buyer_id (
          display_name,
          shop_name
        )
      `)
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('product_variants')
      .select('id, name, price_override')
      .eq('product_id', product.id)
      .order('created_at', { ascending: true }),
  ]);

  const salesCount = salesResult.count ?? 0;
  const reviewStats = reviewStatsResult.data;
  const reviewRows = reviewRowsResult.data;
  const variants = (variantsResult.data ?? []).map((variant) => ({
    id: variant.id,
    name: variant.name,
    price_override:
      variant.price_override !== null ? toNumber(variant.price_override) : null,
  }));

  const categoryRef = Array.isArray(product.category_ref)
    ? product.category_ref[0]
    : product.category_ref;
  const subcategoryRef = Array.isArray(product.subcategory_ref)
    ? product.subcategory_ref[0]
    : product.subcategory_ref;
  const profile = Array.isArray(product.profiles) ? product.profiles[0] : product.profiles;
  const stats = (reviewStats as ProductReviewStatsRow | null) ?? null;
  const averageRatingRaw = stats?.average_rating;
  const averageRating =
    averageRatingRaw === null || averageRatingRaw === undefined
      ? null
      : Number(averageRatingRaw);
  const reviewsCount = typeof stats?.reviews_count === 'number' ? stats.reviews_count : 0;
  const reviews = ((reviewRows ?? []) as ProductReviewRow[]).map((review) => {
    const reviewProfile = Array.isArray(review.profiles)
      ? review.profiles[0]
      : review.profiles;

    return {
      id: review.id,
      buyerId: review.buyer_id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.created_at,
      authorName: reviewProfile?.shop_name || reviewProfile?.display_name || 'Anonymous',
    };
  });
  const categoryLabelFallback =
    locale === 'fr'
      ? categoryRef?.name_fr ||
        categoryRef?.name_en ||
        product.category ||
        tMarket('card.uncategorized')
      : categoryRef?.name_en ||
        categoryRef?.name_fr ||
        product.category ||
        tMarket('card.uncategorized');
  const categoryLabel = categoryRef
    ? safeTranslate(tMarket, `taxonomy.categories.${categoryRef.slug}`, categoryLabelFallback)
    : categoryLabelFallback;
  const subcategoryLabelFallback =
    locale === 'fr'
      ? subcategoryRef?.name_fr || subcategoryRef?.name_en || ''
      : subcategoryRef?.name_en || subcategoryRef?.name_fr || '';
  const subcategoryLabel = subcategoryRef
    ? safeTranslate(
        tMarket,
        `taxonomy.subcategories.${subcategoryRef.slug}`,
        subcategoryLabelFallback,
      )
    : '';
  const contentTranslationStatus = inferStatusFromContentMetadata(
    locale,
    product.content_locales,
    product.content_source_locale,
  );
  const categoryTranslationStatus = categoryRef
    ? inferStatusFromLocalizedPair(locale, categoryRef.name_en, categoryRef.name_fr)
    : 'translated';
  const subcategoryTranslationStatus = subcategoryRef
    ? inferStatusFromLocalizedPair(locale, subcategoryRef.name_en, subcategoryRef.name_fr)
    : 'translated';
  const translationStatus = mergeApiContentTranslationStatuses(
    contentTranslationStatus,
    categoryTranslationStatus,
    subcategoryTranslationStatus,
  );

  const isBlueprint = categoryRef?.slug === AGENT_BLUEPRINTS_CATEGORY_SLUG;
  let blueprintMeta: {
    manifest: AgentBlueprintManifest;
    readmeContent: string | null;
    licenseType: AgentLicenseType;
    isVetted: boolean;
  } | null = null;

  if (isBlueprint) {
    const bpData = await getBlueprintPublicMetadata(product.id);
    if (bpData) {
      blueprintMeta = {
        manifest: bpData.manifest,
        readmeContent: bpData.readme_content,
        licenseType: bpData.license_type,
        isVetted: bpData.is_vetted,
      };
    }
  }

  return {
    id: product.id,
    title: product.title || 'Untitled Product',
    description: product.description || '',
    price,
    originalPrice: originalPrice ?? undefined,
    isPWYW: product.is_pwyw || false,
    minPrice: minPrice > 0 ? minPrice : price,
    variants,
    sales: salesCount || 0,
    rating: Number.isFinite(averageRating as number) ? (averageRating as number) : null,
    reviewsCount,
    reviews,
    category: subcategoryLabel ? `${categoryLabel} / ${subcategoryLabel}` : categoryLabel,
    categorySlug: categoryRef?.slug ?? null,
    categoryLabel,
    subcategorySlug: subcategoryRef?.slug ?? null,
    subcategoryLabel,
    translationStatus,
    lastUpdated: product.updated_at
      ? new Date(product.updated_at).toLocaleDateString(
          locale === 'fr' ? 'fr-CA' : 'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          },
        )
      : safeTranslate(tMarket, 'meta.recently', 'Recently'),
    fileSize,
    format: productFormat,
    author: {
      id: profile?.id ?? null,
      name: profile?.shop_name || profile?.display_name || 'Anonymous',
      avatarUrl: profile?.avatar_url || null,
      joined: profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString(
            locale === 'fr' ? 'fr-CA' : 'en-US',
            {
              month: 'short',
              year: 'numeric',
            },
          )
        : safeTranslate(tMarket, 'meta.recently', 'Recently'),
      verified: profile?.is_verified || false,
    },
    features: productFeatures,
    tags: Array.isArray(product.tags)
      ? product.tags.filter((tag: unknown): tag is string => typeof tag === 'string')
      : [],
    coverImage:
      product.cover_image_url ||
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop',
    videoUrl: product.video_url || null,
    galleryUrls: Array.isArray(product.gallery_urls)
      ? product.gallery_urls.filter((url: unknown): url is string => typeof url === 'string')
      : [],
    blueprintMeta,
  };
}

export const getProductDataCached = unstable_cache(
  async (slug: string, locale: string) => getProductDataUncached(slug, locale),
  ['products:detail:v3'],
  { tags: [PUBLIC_CACHE_TAGS.market], revalidate: 60 },
);
