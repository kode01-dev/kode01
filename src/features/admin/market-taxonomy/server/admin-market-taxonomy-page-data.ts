import 'server-only';

import { z } from 'zod';

import { getServerAdminAuthState } from '@/lib/auth/server-admin';
import { createAdminClient } from '@/lib/supabase/admin';

import type {
  CategoryItem,
  SubcategoryItem,
} from '@/features/admin/market-taxonomy/components/market-taxonomy-types';

const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name_en: z.string(),
  name_fr: z.string(),
  description_en: z.string().nullable(),
  description_fr: z.string().nullable(),
  display_order: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const subcategorySchema = z.object({
  id: z.string(),
  category_id: z.string(),
  slug: z.string(),
  name_en: z.string(),
  name_fr: z.string(),
  description_en: z.string().nullable(),
  description_fr: z.string().nullable(),
  display_order: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const categoryCountSchema = z.object({
  category_id: z.string().nullable(),
});

const subcategoryCountSchema = z.object({
  subcategory_id: z.string().nullable(),
});

type AdminMarketTaxonomyPageData = {
  categories: CategoryItem[];
  subcategories: SubcategoryItem[];
};

export type AdminMarketTaxonomyPageDataResult =
  | { kind: 'redirect'; destination: string }
  | { kind: 'ok'; data: AdminMarketTaxonomyPageData };

function countById<T extends { [key: string]: string | null }>(
  rows: T[],
  key: keyof T,
): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const value = row[key];
    if (!value) return;
    map.set(value, (map.get(value) ?? 0) + 1);
  });
  return map;
}

function parseRows<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context: string,
): T[] {
  const parsed = z.array(schema).safeParse(input);
  if (parsed.success) return parsed.data;

  if (Array.isArray(input)) {
    const safeRows: T[] = [];
    for (const entry of input) {
      const result = schema.safeParse(entry);
      if (result.success) {
        safeRows.push(result.data);
      }
    }

    console.error(`[AdminMarketTaxonomy] Invalid ${context} payload`, {
      droppedRows: input.length - safeRows.length,
      keptRows: safeRows.length,
    });
    return safeRows;
  }

  console.error(`[AdminMarketTaxonomy] Invalid ${context} payload`, {
    issues: parsed.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
  return [];
}

export async function loadAdminMarketTaxonomyPageData(
  locale: string,
): Promise<AdminMarketTaxonomyPageDataResult> {
  const auth = await getServerAdminAuthState();
  if (auth.state === 'unauthenticated') {
    return { kind: 'redirect', destination: `/${locale}` };
  }
  if (auth.state === 'forbidden') {
    return { kind: 'redirect', destination: `/${locale}/admin` };
  }

  const admin = createAdminClient();
  const [
    { data: categoriesData, error: categoriesError },
    { data: subcategoriesData, error: subcategoriesError },
    { data: categoryCountRows, error: categoryCountsError },
    { data: subcategoryCountRows, error: subcategoryCountsError },
  ] = await Promise.all([
    admin
      .from('product_categories')
      .select(
        'id, slug, name_en, name_fr, description_en, description_fr, display_order, is_active, created_at, updated_at',
      )
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('product_subcategories')
      .select(
        'id, category_id, slug, name_en, name_fr, description_en, description_fr, display_order, is_active, created_at, updated_at',
      )
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('products')
      .select('category_id')
      .eq('status', 'published')
      .not('category_id', 'is', null),
    admin
      .from('products')
      .select('subcategory_id')
      .eq('status', 'published')
      .not('subcategory_id', 'is', null),
  ]);

  if (categoriesError || subcategoriesError || categoryCountsError || subcategoryCountsError) {
    console.error('[AdminMarketTaxonomy] Failed to load page data', {
      categoriesError: categoriesError
        ? { code: categoriesError.code, message: categoriesError.message }
        : null,
      subcategoriesError: subcategoriesError
        ? { code: subcategoriesError.code, message: subcategoriesError.message }
        : null,
      categoryCountsError: categoryCountsError
        ? { code: categoryCountsError.code, message: categoryCountsError.message }
        : null,
      subcategoryCountsError: subcategoryCountsError
        ? { code: subcategoryCountsError.code, message: subcategoryCountsError.message }
        : null,
    });
  }

  const parsedCategories = parseRows(categorySchema, categoriesData, 'categories');
  const parsedSubcategories = parseRows(subcategorySchema, subcategoriesData, 'subcategories');
  const parsedCategoryCounts = parseRows(categoryCountSchema, categoryCountRows, 'category counts');
  const parsedSubcategoryCounts = parseRows(
    subcategoryCountSchema,
    subcategoryCountRows,
    'subcategory counts',
  );

  const categoryCountMap = countById(parsedCategoryCounts, 'category_id');
  const subcategoryCountMap = countById(parsedSubcategoryCounts, 'subcategory_id');

  return {
    kind: 'ok',
    data: {
      categories: parsedCategories.map((item) => ({
        id: item.id,
        slug: item.slug,
        name_en: item.name_en,
        name_fr: item.name_fr,
        description_en: item.description_en,
        description_fr: item.description_fr,
        display_order: item.display_order,
        is_active: item.is_active,
        published_products_count: categoryCountMap.get(item.id) ?? 0,
      })),
      subcategories: parsedSubcategories.map((item) => ({
        id: item.id,
        category_id: item.category_id,
        slug: item.slug,
        name_en: item.name_en,
        name_fr: item.name_fr,
        description_en: item.description_en,
        description_fr: item.description_fr,
        display_order: item.display_order,
        is_active: item.is_active,
        published_products_count: subcategoryCountMap.get(item.id) ?? 0,
      })),
    },
  };
}
