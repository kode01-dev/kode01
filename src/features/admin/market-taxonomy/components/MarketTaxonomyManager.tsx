'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { CategoryManagementCard } from './CategoryManagementCard';
import { SubcategoryManagementCard } from './SubcategoryManagementCard';
import type { CategoryItem, SubcategoryItem } from './market-taxonomy-types';
import { useMarketTaxonomyState } from './useMarketTaxonomyState';

type Props = {
  initialCategories: CategoryItem[];
  initialSubcategories: SubcategoryItem[];
};

export function MarketTaxonomyManager({ initialCategories, initialSubcategories }: Props): React.JSX.Element {
  const t = useTranslations('dashboard.admin.market_taxonomy');
  const {
    categories,
    subcategories,
    isLoading,
    status,
    statusTone,
    editingCategoryId,
    categoryForm,
    editingSubcategoryId,
    subcategoryForm,
    categoryById,
    totalCategoryProducts,
    totalSubcategoryProducts,
    setCategoryForm,
    setSubcategoryForm,
    refreshAll,
    resetCategoryForm,
    resetSubcategoryForm,
    startCategoryEdit,
    startSubcategoryEdit,
    saveCategory,
    saveSubcategory,
    toggleCategoryActive,
    toggleSubcategoryActive,
  } = useMarketTaxonomyState({
    initialCategories,
    initialSubcategories,
    t,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">
          {t('overview.total_categories', { count: categories.length })} | {t('overview.total_subcategories', { count: subcategories.length })}
        </p>
        <Button type="button" variant="outline" onClick={() => void refreshAll()} disabled={isLoading} className="rounded-full text-xs font-bold uppercase tracking-widest">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {t('actions.refresh')}
        </Button>
      </div>

      {status && (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
            statusTone === 'error'
              ? 'bg-red-50 text-red-700'
              : statusTone === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-kode01-sauge/10 text-kode01-noir/70'
          }`}
        >
          {status}
        </p>
      )}

      <CategoryManagementCard
        t={t}
        isLoading={isLoading}
        totalCategoryProducts={totalCategoryProducts}
        categories={categories}
        editingCategoryId={editingCategoryId}
        categoryForm={categoryForm}
        setCategoryForm={setCategoryForm}
        saveCategory={saveCategory}
        resetCategoryForm={resetCategoryForm}
        startCategoryEdit={startCategoryEdit}
        toggleCategoryActive={toggleCategoryActive}
      />

      <SubcategoryManagementCard
        t={t}
        isLoading={isLoading}
        totalSubcategoryProducts={totalSubcategoryProducts}
        categories={categories}
        subcategories={subcategories}
        categoryById={categoryById}
        editingSubcategoryId={editingSubcategoryId}
        subcategoryForm={subcategoryForm}
        setSubcategoryForm={setSubcategoryForm}
        saveSubcategory={saveSubcategory}
        resetSubcategoryForm={resetSubcategoryForm}
        startSubcategoryEdit={startSubcategoryEdit}
        toggleSubcategoryActive={toggleSubcategoryActive}
      />
    </div>
  );
}
