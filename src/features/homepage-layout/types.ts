export type HomepageSectionType =
  | 'hero'
  | 'marquee'
  | 'features'
  | 'products_latest'
  | 'top_deals'
  | 'news_latest'
  | 'blog_latest'
  | 'stats'
  | 'cta';

export interface HomepageSectionContent {
  title_en?: string | null;
  title_fr?: string | null;
  subtitle_en?: string | null;
  subtitle_fr?: string | null;
  cta_label_en?: string | null;
  cta_label_fr?: string | null;
  cta_href?: string | null;
}

export interface HomepageSectionConfig {
  id: string;
  type: HomepageSectionType;
  enabled: boolean;
  order: number;
  template: string;
  content: HomepageSectionContent;
  settings: Record<string, unknown>;
}

export interface HomepageSectionCatalogItem {
  type: HomepageSectionType;
  label: string;
  description: string;
  templates: string[];
  defaultTemplate: string;
  defaultContent: HomepageSectionContent;
  defaultSettings: Record<string, unknown>;
}

export interface HomepageTopDealItem {
  id: string;
  slug: string;
  title: string;
  price: number;
  original_price?: number | null;
  is_pwyw: boolean;
  min_price: number;
  sales_count: number;
  cover_image_url: string | null;
  seller_name: string;
  tags: string[];
  content_locales: Array<'fr' | 'en'> | null;
  content_source_locale: 'fr' | 'en' | null;
  createdAt?: string;
  isBundle?: boolean;
}
