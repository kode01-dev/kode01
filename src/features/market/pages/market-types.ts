import type { ApiContentTranslationStatus } from '@/lib/i18n/api-content-status';

export const SORT_OPTIONS = ['newest', 'price_asc', 'price_desc'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const MARKET_TYPE_OPTIONS = ['all', 'product', 'bundle'] as const;
export type MarketFilterType = (typeof MARKET_TYPE_OPTIONS)[number];

export interface ProductCategoryRow {
    id: string;
    slug: string;
    name_en: string;
    name_fr: string;
    description_en: string | null;
    description_fr: string | null;
    display_order: number;
    is_active: boolean;
}

export interface ProductSubcategoryRow {
    id: string;
    category_id: string;
    slug: string;
    name_en: string;
    name_fr: string;
    description_en: string | null;
    description_fr: string | null;
    display_order: number;
    is_active: boolean;
}

export interface SellerProfileRow {
    display_name: string | null;
    shop_name: string | null;
}

export interface ProductMarketRow {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    content_locales: string[] | null;
    content_source_locale: 'fr' | 'en' | null;
    price: number | string | null;
    cover_image_url: string | null;
    tags: unknown;
    category: string | null;
    category_id: string | null;
    subcategory_id: string | null;
    created_at: string;
    seller_profile: SellerProfileRow | SellerProfileRow[] | null;
    category_ref: ProductCategoryRow | ProductCategoryRow[] | null;
    subcategory_ref: ProductSubcategoryRow | ProductSubcategoryRow[] | null;
}

export interface ProductReviewStatsRow {
    product_id: string;
    average_rating: number | string | null;
    reviews_count: number | null;
}

export interface MarketProduct {
    id: string;
    slug: string;
    title: string;
    description: string;
    price: number;
    coverImageUrl: string | null;
    tags: string[];
    categorySlug: string | null;
    categoryLabel: string;
    subcategorySlug: string | null;
    subcategoryLabel: string;
    creator: string;
    createdAt: string;
    averageRating: number | null;
    reviewsCount: number;
    translationStatus: ApiContentTranslationStatus;
    isBundle: boolean;
    blueprintManifest?: { compatible_models: string[]; version: string } | null;
    isBlueprintVetted?: boolean;
    videoUrl?: string | null;
    galleryUrls?: string[] | null;
}

export interface ExpandedSectionsState {
    type: boolean;
    price: boolean;
    category: boolean;
    subcategory: boolean;
    tags: boolean;
}

export interface ActiveFilterChip {
    type: 'search' | 'category' | 'subcategory' | 'tag' | 'type' | 'price';
    value: string;
    label: string;
}
