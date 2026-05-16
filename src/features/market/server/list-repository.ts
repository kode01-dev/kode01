import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import {
  inferStatusFromContentMetadata,
  inferStatusFromLocalizedPair,
  mergeApiContentTranslationStatuses,
} from '@/lib/i18n/api-content-status';
import type {
  MarketProduct,
  ProductCategoryRow,
  ProductReviewStatsRow,
  ProductSubcategoryRow,
} from '@/features/market/pages/market-types';
import { AGENT_BLUEPRINTS_CATEGORY_SLUG } from '@/features/agent-blueprints/types';
import { getBlueprintMetadataForProducts } from '@/features/agent-blueprints/server/repository';

export type MarketListSort = 'newest' | 'price_asc' | 'price_desc';
export type MarketListType = 'all' | 'product' | 'bundle';

export type MarketListQuery = {
  locale: string;
  limit: number;
  offset: number;
  search: string;
  category: string;
  subcategories: string;
  tags: string;
  sort: MarketListSort;
  type: MarketListType;
  includeFacets: boolean;
  includeTotal: boolean;
};

export type MarketListPayload = {
  items: MarketProduct[];
  categories: ProductCategoryRow[];
  subcategories: ProductSubcategoryRow[];
  availableTags: string[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

type ProductListRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  content_locales: string[] | null;
  content_source_locale: 'fr' | 'en' | null;
  price: number | string | null;
  is_bundle: boolean | null;
  cover_image_url: string | null;
  tags: unknown;
  category: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  created_at: string;
  seller_profile?:
    | {
      display_name: string | null;
      shop_name: string | null;
    }
    | Array<{
      display_name: string | null;
      shop_name: string | null;
    }>
    | null;
  category_ref:
    | {
      id: string;
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }
    | Array<{
      id: string;
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }>
    | null;
  subcategory_ref:
    | {
      id: string;
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }
    | Array<{
      id: string;
      slug: string;
      name_en: string | null;
      name_fr: string | null;
    }>
    | null;
};

type SearchPageRpcRow = {
  product_ids: string[] | null;
  total_count: number | string | null;
};

const FALLBACK_REVALIDATE_SECONDS = 60;
const MARKET_PRODUCTS_SELECT_WITH_SELLER = `
  id,
  slug,
  title,
  description,
  content_locales,
  content_source_locale,
  price,
  is_bundle,
  cover_image_url,
  tags,
  category,
  category_id,
  subcategory_id,
  created_at,
  seller_profile:profile_marketplace_data!seller_id (
    display_name,
    shop_name
  ),
  category_ref:product_categories!products_category_id_fkey (
    id,
    slug,
    name_en,
    name_fr
  ),
  subcategory_ref:product_subcategories!products_subcategory_id_fkey (
    id,
    slug,
    name_en,
    name_fr
  )
`;

const MARKET_PRODUCTS_SELECT_WITHOUT_SELLER = `
  id,
  slug,
  title,
  description,
  content_locales,
  content_source_locale,
  price,
  is_bundle,
  cover_image_url,
  tags,
  category,
  category_id,
  subcategory_id,
  created_at,
  category_ref:product_categories!products_category_id_fkey (
    id,
    slug,
    name_en,
    name_fr
  ),
  subcategory_ref:product_subcategories!products_subcategory_id_fkey (
    id,
    slug,
    name_en,
    name_fr
  )
`;

function parseCsv(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((entry): entry is string => typeof entry === 'string');
}

function resolveLocalizedName(
  locale: string,
  englishName: string | null | undefined,
  frenchName: string | null | undefined,
  fallback: string,
): string {
  if (locale === 'fr') return frenchName || englishName || fallback;
  return englishName || frenchName || fallback;
}

function normalizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,%]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getSellerName(
  profile:
    | ProductListRow['seller_profile']
    | undefined
    | null,
): string {
  const seller = firstOrNull(profile);
  return seller?.shop_name || seller?.display_name || 'Anonymous';
}

function isSellerProfileSelectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
  const haystack = `${message} ${details}`.toLowerCase();

  return (
    haystack.includes('profile_marketplace_data') &&
    (code === '42501' ||
      code.toLowerCase() === 'pgrst200' ||
      code.toLowerCase() === 'pgrst201' ||
      code.toLowerCase() === 'pgrst205' ||
      haystack.includes('permission denied'))
  );
}

async function resolveSearchProductPage(params: {
  supabase: ReturnType<typeof createPublicServerClient>;
  normalizedSearch: string;
  limit: number;
  offset: number;
  type: MarketListType;
  sort: MarketListSort;
  categoryId: string | null;
  selectedSubcategoryIds: string[];
  selectedTags: string[];
}): Promise<{ productIds: string[]; totalCount: number; hasOverflow: boolean }> {
  const {
    supabase,
    normalizedSearch,
    limit,
    offset,
    type,
    sort,
    categoryId,
    selectedSubcategoryIds,
    selectedTags,
  } = params;

  const requestLimit = limit + 1;
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      params?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  }).rpc('search_market_products_page', {
    p_query: normalizedSearch,
    p_limit: requestLimit,
    p_offset: offset,
    p_type: type,
    p_sort: sort,
    p_category_id: categoryId,
    p_subcategory_ids: selectedSubcategoryIds.length > 0 ? selectedSubcategoryIds : null,
    p_tags: selectedTags.length > 0 ? selectedTags : null,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? (data[0] as SearchPageRpcRow | undefined) : undefined;
  const rawProductIds = Array.isArray(row?.product_ids)
    ? row.product_ids.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const totalCount = safeNumber(row?.total_count);
  const hasOverflow = rawProductIds.length > limit;
  const productIds = hasOverflow ? rawProductIds.slice(0, limit) : rawProductIds;

  return {
    productIds,
    totalCount,
    hasOverflow,
  };
}

async function getMarketListDataUncached(query: MarketListQuery): Promise<MarketListPayload> {
  const {
    locale,
    limit,
    offset,
    search,
    category,
    subcategories,
    tags,
    sort,
    type,
    includeFacets,
    includeTotal,
  } = query;
  const selectedSubcategorySlugs = parseCsv(subcategories).map((entry) => entry.toLowerCase());
  const selectedTags = parseCsv(tags);
  const normalizedSearch = normalizeSearchTerm(search);
  const t = await getTranslations({ locale, namespace: 'market' });
  const supabase = createPublicServerClient();
  const mustLoadTaxonomy = includeFacets || Boolean(category) || selectedSubcategorySlugs.length > 0;

  let categories: ProductCategoryRow[] = [];
  let subcategoriesData: ProductSubcategoryRow[] = [];
  if (mustLoadTaxonomy) {
    const [categoriesResult, subcategoriesResult] = await Promise.all([
      supabase
        .from('product_categories')
        .select('id, slug, name_en, name_fr, description_en, description_fr, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('product_subcategories')
        .select('id, category_id, slug, name_en, name_fr, description_en, description_fr, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (subcategoriesResult.error) throw subcategoriesResult.error;

    categories = (categoriesResult.data ?? []) as ProductCategoryRow[];
    subcategoriesData = (subcategoriesResult.data ?? []) as ProductSubcategoryRow[];
  }

  const categoryBySlug = new Map(categories.map((entry) => [entry.slug, entry]));
  const selectedCategory = category ? (categoryBySlug.get(category) ?? null) : null;

  const allowedSubcategories = selectedCategory
    ? subcategoriesData.filter((entry) => entry.category_id === selectedCategory.id)
    : subcategoriesData;
  const subcategoryIdBySlug = new Map(
    allowedSubcategories.map((entry) => [entry.slug.toLowerCase(), entry.id]),
  );
  const selectedSubcategoryIds = selectedSubcategorySlugs
    .map((slug) => subcategoryIdBySlug.get(slug))
    .filter((value): value is string => typeof value === 'string');

  if (selectedSubcategorySlugs.length > 0 && selectedSubcategoryIds.length === 0) {
    return {
      items: [],
      categories: includeFacets ? categories : [],
      subcategories: includeFacets ? subcategoriesData : [],
      availableTags: [],
      total: 0,
      hasMore: false,
      nextOffset: null,
    };
  }

  let searchPage: Awaited<ReturnType<typeof resolveSearchProductPage>> | null = null;
  if (normalizedSearch) {
    searchPage = await resolveSearchProductPage({
      supabase,
      normalizedSearch,
      limit,
      offset,
      type,
      sort,
      categoryId: selectedCategory?.id ?? null,
      selectedSubcategoryIds,
      selectedTags,
    });

    if (searchPage.productIds.length === 0) {
      return {
        items: [],
        categories: includeFacets ? categories : [],
        subcategories: includeFacets ? subcategoriesData : [],
        availableTags: [],
        total: includeTotal ? searchPage.totalCount : offset,
        hasMore: false,
        nextOffset: null,
      };
    }
  }

  const shouldCountFromQuery = includeTotal && !searchPage;

  if (!selectedCategory && category) {
    return {
      items: [],
      categories: includeFacets ? categories : [],
      subcategories: includeFacets ? subcategoriesData : [],
      availableTags: [],
      total: 0,
      hasMore: false,
      nextOffset: null,
    };
  }

  function buildProductsQuery(selectColumns: string) {
    let query = shouldCountFromQuery
      ? supabase
        .from('products')
        .select(selectColumns, { count: 'exact' })
        .eq('status', 'published')
      : supabase
        .from('products')
        .select(selectColumns)
        .eq('status', 'published');

    if (type === 'bundle') {
      query = query.eq('is_bundle', true);
    } else if (type === 'product') {
      query = query.eq('is_bundle', false);
    }

    if (selectedCategory) {
      query = query.eq('category_id', selectedCategory.id);
    }

    if (selectedSubcategoryIds.length > 0) {
      query = query.in('subcategory_id', selectedSubcategoryIds);
    }

    if (selectedTags.length > 0) {
      query = query.overlaps('tags', selectedTags);
    }

    if (searchPage) {
      query = query.in('id', searchPage.productIds);
    }

    if (!searchPage) {
      if (sort === 'price_asc') {
        query = query.order('price', { ascending: true });
      } else if (sort === 'price_desc') {
        query = query.order('price', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }
    }

    return query;
  }

  let productRowsRaw: ProductListRow[] = [];
  let totalCount: number | null = null;

  if (searchPage) {
    let { data, error } = await buildProductsQuery(MARKET_PRODUCTS_SELECT_WITH_SELLER);
    if (error && isSellerProfileSelectError(error)) {
      console.warn('Market list: seller profile view unavailable; returning products without seller names.', error);
      const fallbackResult = await buildProductsQuery(MARKET_PRODUCTS_SELECT_WITHOUT_SELLER);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }
    if (error) throw error;
    productRowsRaw = (data ?? []) as unknown as ProductListRow[];
  } else {
    const rangeEnd = includeTotal ? offset + limit - 1 : offset + limit;
    let { data, error, count } = await buildProductsQuery(MARKET_PRODUCTS_SELECT_WITH_SELLER).range(offset, rangeEnd);
    if (error && isSellerProfileSelectError(error)) {
      console.warn('Market list: seller profile view unavailable; returning products without seller names.', error);
      const fallbackResult = await buildProductsQuery(MARKET_PRODUCTS_SELECT_WITHOUT_SELLER).range(offset, rangeEnd);
      data = fallbackResult.data;
      error = fallbackResult.error;
      count = fallbackResult.count;
    }
    if (error) throw error;
    productRowsRaw = (data ?? []) as unknown as ProductListRow[];
    totalCount = count;
  }

  let hasOverflow = false;
  let productRows: ProductListRow[] = [];

  if (searchPage) {
    const rowById = new Map(productRowsRaw.map((row) => [row.id, row]));
    productRows = searchPage.productIds
      .map((id) => rowById.get(id))
      .filter((row): row is ProductListRow => Boolean(row));
    hasOverflow = searchPage.hasOverflow;
  } else {
    hasOverflow = !includeTotal && productRowsRaw.length > limit;
    productRows = hasOverflow ? productRowsRaw.slice(0, limit) : productRowsRaw;
  }

  const productIds = productRows.map((row) => row.id);

  const reviewStatsByProductId = new Map<string, { averageRating: number | null; reviewsCount: number }>();
  if (productIds.length > 0) {
    const { data: reviewStatsRows, error: reviewStatsError } = await supabase
      .from('product_review_stats')
      .select('product_id, average_rating, reviews_count')
      .in('product_id', productIds);
    if (reviewStatsError) throw reviewStatsError;

    (reviewStatsRows ?? []).forEach((raw) => {
      const row = raw as ProductReviewStatsRow;
      const average = row.average_rating === null ? null : Number(row.average_rating);
      reviewStatsByProductId.set(row.product_id, {
        averageRating: Number.isFinite(average as number) ? (average as number) : null,
        reviewsCount: typeof row.reviews_count === 'number' ? row.reviews_count : 0,
      });
    });
  }

  const mappedItemsBase: MarketProduct[] = productRows.map((row) => {
    const categoryRef = firstOrNull(row.category_ref);
    const subcategoryRef = firstOrNull(row.subcategory_ref);
    const reviewStats = reviewStatsByProductId.get(row.id) ?? {
      averageRating: null,
      reviewsCount: 0,
    };
    const categoryLabel = resolveLocalizedName(
      locale,
      categoryRef?.name_en,
      categoryRef?.name_fr,
      row.category ?? t('card.uncategorized'),
    );
    const subcategoryLabel = resolveLocalizedName(
      locale,
      subcategoryRef?.name_en,
      subcategoryRef?.name_fr,
      '',
    );
    const contentTranslationStatus = inferStatusFromContentMetadata(
      locale,
      row.content_locales,
      row.content_source_locale,
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

    return {
      id: row.id,
      slug: row.slug ?? '',
      title: row.title,
      description: row.description ?? '',
      price: safeNumber(row.price),
      isBundle: row.is_bundle === true,
      coverImageUrl: row.cover_image_url,
      tags: normalizeTags(row.tags),
      categorySlug: categoryRef?.slug ?? row.category ?? null,
      categoryLabel,
      subcategorySlug: subcategoryRef?.slug ?? null,
      subcategoryLabel,
      creator: getSellerName(row.seller_profile),
      createdAt: row.created_at,
      averageRating: reviewStats.averageRating,
      reviewsCount: reviewStats.reviewsCount,
      translationStatus,
    };
  });

  // Enrich blueprint products with manifest & vetted status
  const blueprintProductIds = mappedItemsBase
    .filter((item) => item.categorySlug === AGENT_BLUEPRINTS_CATEGORY_SLUG)
    .map((item) => item.id);
  const blueprintMetas = await getBlueprintMetadataForProducts(blueprintProductIds);

  const mappedItems: MarketProduct[] = mappedItemsBase.map((item) => {
    const bpMeta = blueprintMetas.get(item.id);
    if (!bpMeta) return item;
    return {
      ...item,
      blueprintManifest: {
        compatible_models: bpMeta.manifest.compatible_models ?? [],
        version: bpMeta.manifest.version ?? '',
      },
      isBlueprintVetted: bpMeta.is_vetted,
    };
  });

  let availableTags: string[] = [];
  if (includeFacets) {
    let availableTagsQuery = supabase
      .from('products')
      .select('tags')
      .eq('status', 'published');

    if (type === 'bundle') {
      availableTagsQuery = availableTagsQuery.eq('is_bundle', true);
    } else if (type === 'product') {
      availableTagsQuery = availableTagsQuery.eq('is_bundle', false);
    }

    if (selectedCategory) {
      availableTagsQuery = availableTagsQuery.eq('category_id', selectedCategory.id);
    }
    if (selectedSubcategoryIds.length > 0) {
      availableTagsQuery = availableTagsQuery.in('subcategory_id', selectedSubcategoryIds);
    }

    const { data: tagsRows, error: tagsError } = await availableTagsQuery;
    if (tagsError) throw tagsError;

    availableTags = Array.from(
      (tagsRows ?? []).reduce((set, row) => {
        const values = normalizeTags((row as { tags: unknown }).tags);
        values.forEach((value) => {
          if (value.trim()) set.add(value.trim());
        });
        return set;
      }, new Set<string>()),
    ).sort((a, b) => a.localeCompare(b));
  }

  const total = includeTotal
    ? (searchPage ? searchPage.totalCount : (totalCount ?? 0))
    : offset + mappedItems.length + (hasOverflow ? 1 : 0);
  const hasMore = includeTotal
    ? offset + mappedItems.length < total
    : hasOverflow;
  const nextOffset = hasMore ? offset + mappedItems.length : null;

  return {
    items: mappedItems,
    categories: includeFacets ? categories : [],
    subcategories: includeFacets ? subcategoriesData : [],
    availableTags,
    total,
    hasMore,
    nextOffset,
  };
}

const getMarketListDataCachedInternal = unstable_cache(
  async (query: MarketListQuery): Promise<MarketListPayload> => getMarketListDataUncached(query),
  ['market:list:v2'],
  { tags: [PUBLIC_CACHE_TAGS.market], revalidate: FALLBACK_REVALIDATE_SECONDS },
);

export async function getMarketListDataCached(query: MarketListQuery): Promise<MarketListPayload> {
  return getMarketListDataCachedInternal(query);
}
