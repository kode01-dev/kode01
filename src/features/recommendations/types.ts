import type { ApiContentTranslationStatus } from '@/lib/i18n/api-content-status';

export type RecommendationEventType =
  | 'product_view'
  | 'recommendation_click'
  | 'blog_to_news_click'
  | 'news_to_blog_click'
  | 'add_to_cart'
  | 'checkout_started'
  | 'checkout_completed'
  | 'download_started'
  | 'refund_requested';
export type RecommendationSourceType = 'product' | 'blog' | 'news' | 'cart' | 'checkout' | 'download' | 'refund';

export interface RecommendationEventPayload {
  eventType: RecommendationEventType;
  sourceType: RecommendationSourceType;
  sourceSlug?: string;
  targetProductId?: string;
  signalPayload?: {
    keywords?: string[];
    [key: string]: unknown;
  };
}

export type RecommendationContext =
  {
    type: 'product';
    currentProductId: string;
    title: string;
    category?: string | null;
    tags?: string[];
  };

export interface RecommendedPaidProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  isPWYW: boolean;
  minPrice: number;
  coverImageUrl: string | null;
  sellerName: string;
  category: string | null;
  tags: string[];
  contentLocales: Array<'fr' | 'en'> | null;
  contentSourceLocale: 'fr' | 'en' | null;
  translationStatus?: ApiContentTranslationStatus;
  score: number;
}

export interface AnonymousRecommendationProfile {
  version: 1;
  updatedAt: string;
  keywordWeights: Record<string, number>;
  recentClickedProductIds: string[];
}
