import type { useTranslations } from 'next-intl';

export const MARKET_CATEGORIES_RESOURCE = 'market-categories';
export const MARKET_SUBCATEGORIES_RESOURCE = 'market-subcategories';

export type CategoryItem = {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string | null;
  description_fr: string | null;
  display_order: number;
  is_active: boolean;
  published_products_count: number;
};

export type SubcategoryItem = {
  id: string;
  category_id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string | null;
  description_fr: string | null;
  display_order: number;
  is_active: boolean;
  published_products_count: number;
};

export type MarketTaxonomyTranslator = ReturnType<typeof useTranslations>;

export type CategoryCreatePayload = {
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string | null;
  description_fr: string | null;
  display_order: number;
  is_active: boolean;
};

export type CategoryUpdatePayload = Partial<Omit<CategoryCreatePayload, 'slug'>>;

export type SubcategoryCreatePayload = {
  category_id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string | null;
  description_fr: string | null;
  display_order: number;
  is_active: boolean;
};

export type SubcategoryUpdatePayload = Partial<Omit<SubcategoryCreatePayload, 'slug'>>;

export type CategoryFormState = {
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  display_order: string;
  is_active: boolean;
};

export type SubcategoryFormState = {
  category_id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  display_order: string;
  is_active: boolean;
};

export const categoryFormDefaults: CategoryFormState = {
  slug: '',
  name_en: '',
  name_fr: '',
  description_en: '',
  description_fr: '',
  display_order: '0',
  is_active: true,
};

export const subcategoryFormDefaults: SubcategoryFormState = {
  category_id: '',
  slug: '',
  name_en: '',
  name_fr: '',
  description_en: '',
  description_fr: '',
  display_order: '0',
  is_active: true,
};
