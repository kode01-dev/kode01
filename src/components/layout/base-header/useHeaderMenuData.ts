'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';

import type {
    ProductCategoryMenuRow,
    ProductSubcategoryMenuRow,
    ProductTaxonomyUsageRow,
} from './types';

interface UseHeaderMenuDataResult {
    menuCategories: ProductCategoryMenuRow[];
    subcategoriesByCategoryId: Map<string, ProductSubcategoryMenuRow[]>;
}

export function useHeaderMenuData(): UseHeaderMenuDataResult {
    const [menuCategories, setMenuCategories] = useState<ProductCategoryMenuRow[]>([]);
    const [menuSubcategories, setMenuSubcategories] = useState<ProductSubcategoryMenuRow[]>([]);

    useEffect(() => {
        let cancelled = false;

        const loadMenuTaxonomy = async () => {
            if (!PUBLIC_MARKETPLACE_ENABLED) {
                setMenuCategories([]);
                setMenuSubcategories([]);
                return;
            }

            if (!isSupabasePublicEnvConfigured()) {
                if (!cancelled) {
                    setMenuCategories([]);
                    setMenuSubcategories([]);
                }
                return;
            }

            try {
                const supabase = createClient();
                const [categoriesResult, subcategoriesResult, usageResult] = await Promise.all([
                    supabase
                        .from('product_categories')
                        .select('id, slug, name_en, name_fr, display_order')
                        .eq('is_active', true)
                        .order('display_order', { ascending: true }),
                    supabase
                        .from('product_subcategories')
                        .select('id, category_id, slug, name_en, name_fr, display_order')
                        .eq('is_active', true)
                        .order('category_id', { ascending: true })
                        .order('display_order', { ascending: true }),
                    supabase
                        .from('products')
                        .select('category_id, subcategory_id')
                        .eq('status', 'published')
                        .not('category_id', 'is', null),
                ]);

                if (categoriesResult.error) throw categoriesResult.error;
                if (subcategoriesResult.error) throw subcategoriesResult.error;
                if (usageResult.error) throw usageResult.error;
                if (cancelled) return;

                const categoryUsage = new Set<string>();
                const subcategoryUsage = new Set<string>();
                ((usageResult.data ?? []) as ProductTaxonomyUsageRow[]).forEach((row) => {
                    if (row.category_id) categoryUsage.add(row.category_id);
                    if (row.subcategory_id) subcategoryUsage.add(row.subcategory_id);
                });

                const categories = ((categoriesResult.data ?? []) as ProductCategoryMenuRow[])
                    .filter((category) => categoryUsage.has(category.id));

                const allowedCategoryIds = new Set(categories.map((category) => category.id));
                const subcategories = ((subcategoriesResult.data ?? []) as ProductSubcategoryMenuRow[])
                    .filter(
                        (subcategory) =>
                            allowedCategoryIds.has(subcategory.category_id)
                            && subcategoryUsage.has(subcategory.id),
                    );

                setMenuCategories(categories);
                setMenuSubcategories(subcategories);
            } catch (error) {
                if (cancelled) return;
                console.error('Failed to load header market taxonomy:', error);
                setMenuCategories([]);
                setMenuSubcategories([]);
            }
        };

        void loadMenuTaxonomy();

        return () => {
            cancelled = true;
        };
    }, []);

    const subcategoriesByCategoryId = useMemo(
        () =>
            menuSubcategories.reduce<Map<string, ProductSubcategoryMenuRow[]>>((map, subcategory) => {
                const entries = map.get(subcategory.category_id) ?? [];
                entries.push(subcategory);
                map.set(subcategory.category_id, entries);
                return map;
            }, new Map()),
        [menuSubcategories],
    );

    return {
        menuCategories,
        subcategoriesByCategoryId,
    };
}
