import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { getLocalizedName, safeTaxonomyTranslation, type MarketTranslationFn } from './market-utils';
import type { ProductCategoryRow, SortOption } from './market-types';

interface MarketMobileFiltersDrawerProps {
  t: MarketTranslationFn;
  locale: string;
  isOpen: boolean;
  closeMobileFilters: () => void;
  clearFilters: () => void;
  categories: ProductCategoryRow[];
  selectedCategorySlug: string;
  selectCategory: (slug: string) => void;
  clearCategory: () => void;
  sortOption: SortOption;
  setSortOption: (value: SortOption) => void;
  children: ReactNode;
}

function sanitizeIdSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

export function MarketMobileFiltersDrawer({
  t,
  locale,
  isOpen,
  closeMobileFilters,
  clearFilters,
  categories,
  selectedCategorySlug,
  selectCategory,
  clearCategory,
  sortOption,
  setSortOption,
  children,
}: MarketMobileFiltersDrawerProps): React.JSX.Element {
  return (
    <>
      {isOpen && (
        <div
          id="market-filters-mobile-overlay"
          onClick={closeMobileFilters}
          className="fixed inset-0 bg-kode01-noir/20 backdrop-blur-sm z-50 lg:hidden transition-all duration-300"
        />
      )}

      <div
        id="market-filters-mobile-drawer"
        className={cn(
          'fixed inset-y-4 right-4 w-[calc(100%-32px)] max-w-sm bg-white z-50 lg:hidden rounded-[32px] border border-black/5 shadow-2xl flex flex-col transition-transform duration-500',
          isOpen ? 'translate-x-0' : 'translate-x-[120%]',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="p-8 flex items-center justify-between">
          <h3 className="font-serif font-black text-2xl text-kode01-noir lowercase tracking-tight">
            {t('filters.title')}
          </h3>
          <button
            id="market-filters-mobile-close"
            onClick={closeMobileFilters}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-kode01-cream/50 text-kode01-noir hover:bg-kode01-pink transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-4 space-y-8 scrollbar-thin">
          {/* Categories section — moved from hero on mobile */}
          {categories.length > 0 && (
            <div>
              <h4 className="text-[10px] font-black text-kode01-noir/30 uppercase tracking-widest mb-4">
                {t('filters.category')}
              </h4>
              <div className="flex flex-wrap gap-2.5">
                <button
                  id="market-mobile-drawer-category-all"
                  onClick={clearCategory}
                  className={cn(
                    'px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                    !selectedCategorySlug
                      ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                      : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                  )}
                >
                  {t('filters.category_all')}
                </button>
                {categories.map((category) => {
                  const fallbackLabel = getLocalizedName(
                    locale,
                    category.name_en,
                    category.name_fr,
                    category.slug,
                  );
                  const label = safeTaxonomyTranslation(
                    t,
                    `taxonomy.categories.${category.slug}`,
                    fallbackLabel,
                  );
                  const isActive = selectedCategorySlug === category.slug;
                  return (
                    <button
                      key={category.id}
                      id={`market-mobile-drawer-category-${sanitizeIdSegment(category.slug)}`}
                      onClick={() => selectCategory(category.slug)}
                      className={cn(
                        'px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                        isActive
                          ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                          : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sort section */}
          <div>
            <h4 className="text-[10px] font-black text-kode01-noir/30 uppercase tracking-widest mb-4">
              {t('filters.sort')}
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {(['newest', 'price_asc', 'price_desc'] as const).map((option) => {
                const isActive = sortOption === option;
                const labelKey = `filters.sort_${option}` as const;
                return (
                  <button
                    key={option}
                    id={`market-mobile-drawer-sort-${option}`}
                    onClick={() => setSortOption(option)}
                    className={cn(
                      'px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                      isActive
                        ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                        : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                    )}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Existing filter content */}
          {children}
        </div>

        <div className="p-8 pt-4">
          <div className="flex gap-3">
            <button
              id="market-filters-mobile-reset"
              onClick={clearFilters}
              className="flex-1 py-4 px-6 bg-kode01-cream/50 text-kode01-noir font-bold rounded-full text-xs uppercase tracking-widest hover:bg-kode01-noir hover:text-white transition-all cursor-pointer"
            >
              {t('filters.reset')}
            </button>
            <button
              id="market-filters-mobile-apply"
              onClick={closeMobileFilters}
              className="flex-[2] py-4 px-10 bg-kode01-pink text-kode01-noir font-bold rounded-full text-xs uppercase tracking-widest hover:bg-kode01-noir hover:text-white transition-all shadow-lg shadow-kode01-pink/20 cursor-pointer"
            >
              {t('filters.show_results')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
