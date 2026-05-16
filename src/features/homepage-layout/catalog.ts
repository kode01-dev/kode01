import { HomepageSectionCatalogItem, HomepageSectionConfig, HomepageSectionType } from './types';

const EMPTY_CONTENT = {
  title_en: null,
  title_fr: null,
  subtitle_en: null,
  subtitle_fr: null,
  cta_label_en: null,
  cta_label_fr: null,
  cta_href: null,
};

export const HOMEPAGE_SECTION_CATALOG: HomepageSectionCatalogItem[] = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'Main hero section',
    templates: ['classic', 'minimal', 'focus'],
    defaultTemplate: 'classic',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: {},
  },
  {
    type: 'marquee',
    label: 'Marquee',
    description: 'Scrolling keyword ribbon',
    templates: ['ribbon', 'mono'],
    defaultTemplate: 'ribbon',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: {},
  },
  {
    type: 'features',
    label: 'Features',
    description: 'Creator/Builder cards',
    templates: ['split', 'stacked', 'compact'],
    defaultTemplate: 'split',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: {},
  },
  {
    type: 'products_latest',
    label: 'Latest Products',
    description: 'Newest published products',
    templates: ['grid', 'compact', 'spotlight'],
    defaultTemplate: 'grid',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: { limit: 8 },
  },
  {
    type: 'top_deals',
    label: 'Top Deals',
    description: 'Best-selling products over a time window',
    templates: ['grid', 'compact', 'spotlight'],
    defaultTemplate: 'grid',
    defaultContent: {
      ...EMPTY_CONTENT,
      title_en: 'Top Deals',
      title_fr: 'Top Deals',
      subtitle_en: 'Best-selling picks this week',
      subtitle_fr: 'Les meilleures ventes de la semaine',
      cta_label_en: 'View all',
      cta_label_fr: 'Voir tout',
      cta_href: '/market',
    },
    defaultSettings: { limit: 6, window_days: 7 },
  },
  {
    type: 'news_latest',
    label: 'Latest News',
    description: 'AI recap latest posts',
    templates: ['cards', 'compact'],
    defaultTemplate: 'cards',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: { limit: 3 },
  },
  {
    type: 'stats',
    label: 'Stats',
    description: 'Website statistics',
    templates: ['band', 'cards'],
    defaultTemplate: 'band',
    defaultContent: EMPTY_CONTENT,
    defaultSettings: {},
  },
  {
    type: 'cta',
    label: 'Call to Action',
    description: 'Configurable CTA banner',
    templates: ['banner', 'panel', 'minimal'],
    defaultTemplate: 'banner',
    defaultContent: {
      ...EMPTY_CONTENT,
      title_en: 'Ready to launch your next digital product?',
      title_fr: 'Pret a lancer votre prochain produit digital ?',
      subtitle_en: 'Join KODE01 creators and start selling today.',
      subtitle_fr: 'Rejoins les createurs KODE01 et commence a vendre.',
      cta_label_en: 'Start selling',
      cta_label_fr: 'Commencer a vendre',
      cta_href: '/vendor',
    },
    defaultSettings: {},
  },
];

export const HOMEPAGE_SECTION_TEMPLATES = HOMEPAGE_SECTION_CATALOG.reduce<Record<HomepageSectionType, string[]>>(
  (acc, item) => {
    acc[item.type] = item.templates;
    return acc;
  },
  {} as Record<HomepageSectionType, string[]>,
);

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionConfig[] = [
  { id: 'hero-1', type: 'hero', enabled: true, order: 0, template: 'classic', content: { ...EMPTY_CONTENT }, settings: {} },
  { id: 'marquee-1', type: 'marquee', enabled: true, order: 1, template: 'ribbon', content: { ...EMPTY_CONTENT }, settings: {} },
  { id: 'features-1', type: 'features', enabled: true, order: 2, template: 'split', content: { ...EMPTY_CONTENT }, settings: {} },
  { id: 'products-latest-1', type: 'products_latest', enabled: true, order: 3, template: 'grid', content: { ...EMPTY_CONTENT }, settings: { limit: 8 } },
  {
    id: 'top-deals-1',
    type: 'top_deals',
    enabled: true,
    order: 4,
    template: 'grid',
    content: {
      ...EMPTY_CONTENT,
      title_en: 'Popular',
      title_fr: 'Populaire',
      subtitle_en: 'Best-selling picks this week',
      subtitle_fr: 'Les meilleures ventes de la semaine',
      cta_label_en: 'View all',
      cta_label_fr: 'Voir tout',
      cta_href: '/market',
    },
    settings: { limit: 6, window_days: 7 },
  },
  { id: 'stats-1', type: 'stats', enabled: true, order: 5, template: 'band', content: { ...EMPTY_CONTENT }, settings: {} },
  { id: 'cta-1', type: 'cta', enabled: true, order: 6, template: 'banner', content: { ...EMPTY_CONTENT }, settings: {} },
  { id: 'news-latest-1', type: 'news_latest', enabled: true, order: 7, template: 'cards', content: { ...EMPTY_CONTENT }, settings: { limit: 3 } },
];

export function getCatalogItem(type: HomepageSectionType): HomepageSectionCatalogItem {
  const item = HOMEPAGE_SECTION_CATALOG.find((entry) => entry.type === type);
  if (!item) {
    throw new Error(`Unknown homepage section type: ${type}`);
  }
  return item;
}

export function createSectionFromCatalog(type: HomepageSectionType, id: string, order: number): HomepageSectionConfig {
  const catalog = getCatalogItem(type);
  return {
    id,
    type,
    enabled: true,
    order,
    template: catalog.defaultTemplate,
    content: { ...catalog.defaultContent },
    settings: { ...catalog.defaultSettings },
  };
}
