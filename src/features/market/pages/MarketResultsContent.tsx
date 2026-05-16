import type { DataSafetyState } from '@/lib/resilience/data-safety';
import { MarketingGridSkeleton } from '@/components/skeletons';
import { Zap } from 'lucide-react';

import { MarketActiveFilterChips } from './MarketActiveFilterChips';
import { MarketProductCard } from './MarketProductCard';
import { MarketSafetyBanner } from './MarketSafetyBanner';
import type { MarketTranslationFn } from './market-utils';
import type {
  MarketFilterType,
  MarketProduct,
  ProductCategoryRow,
  ProductSubcategoryRow,
} from './market-types';

interface MarketResultsContentProps {
  t: MarketTranslationFn;
  locale: string;
  hasActiveFilters: boolean;
  selectedType: MarketFilterType;
  searchTerm: string;
  selectedCategorySlug: string;
  selectedSubcategorySlugs: string[];
  selectedCategorySubcategories: ProductSubcategoryRow[];
  selectedTags: string[];
  priceMin: number;
  priceMax: number;
  categoryBySlug: Map<string, ProductCategoryRow>;
  clearFilters: () => void;
  clearCategory: () => void;
  clearType: () => void;
  clearSearch: () => void;
  clearPriceRange: () => void;
  removeSubcategory: (slug: string) => void;
  removeTag: (tag: string) => void;
  safetyState: DataSafetyState;
  loading: boolean;
  filteredProducts: MarketProduct[];
  totalResults: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onRefreshNow: () => Promise<void>;
}

export function MarketResultsContent({
  t,
  locale,
  hasActiveFilters,
  selectedType,
  searchTerm,
  selectedCategorySlug,
  selectedSubcategorySlugs,
  selectedCategorySubcategories,
  selectedTags,
  priceMin,
  priceMax,
  categoryBySlug,
  clearFilters,
  clearCategory,
  clearType,
  clearSearch,
  clearPriceRange,
  removeSubcategory,
  removeTag,
  safetyState,
  loading,
  filteredProducts,
  totalResults,
  hasMore,
  loadingMore,
  onLoadMore,
  onRefreshNow,
}: MarketResultsContentProps): React.JSX.Element {
  const hasSafetyIncident = safetyState !== 'ok';
  const isDegradedMode = safetyState === 'degraded';

  return (
    <>
      <MarketActiveFilterChips
        t={t}
        locale={locale}
        hasActiveFilters={hasActiveFilters}
        selectedType={selectedType}
        searchTerm={searchTerm}
        selectedCategorySlug={selectedCategorySlug}
        selectedSubcategorySlugs={selectedSubcategorySlugs}
        selectedCategorySubcategories={selectedCategorySubcategories}
        selectedTags={selectedTags}
        priceMin={priceMin}
        priceMax={priceMax}
        categoryBySlug={categoryBySlug}
        clearFilters={clearFilters}
        clearCategory={clearCategory}
        clearType={clearType}
        clearSearch={clearSearch}
        clearPriceRange={clearPriceRange}
        removeSubcategory={removeSubcategory}
        removeTag={removeTag}
      />

      {hasSafetyIncident && (
        <MarketSafetyBanner
          t={t}
          isDegradedMode={isDegradedMode}
          loading={loading}
          onRefreshNow={onRefreshNow}
        />
      )}

      {loading ? (
        <MarketingGridSkeleton
          withHero={false}
          withFilters={false}
          showResultsHeader={false}
          cardVariant="product"
          cards={6}
        />
      ) : filteredProducts.length === 0 && !hasSafetyIncident ? (
        <div className="py-24 bg-kode01-cream/30 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Zap size={28} className="text-kode01-pink" />
          </div>
          <h3 className="text-2xl font-serif font-black text-kode01-noir mb-3">
            {t('results.empty_title')}
          </h3>
          <p className="text-kode01-noir/55 max-w-xl mb-6">
            {t('results.empty_description')}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="px-10 py-4 bg-kode01-noir text-white font-bold text-sm rounded-full transition-all duration-200 hover:bg-kode01-pink hover:text-kode01-noir uppercase tracking-widest border-none cursor-pointer"
          >
            {t('results.clear_filters')}
          </button>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {filteredProducts.map((product) => (
              <MarketProductCard
                key={product.id}
                product={product}
                locale={locale}
                t={t}
              />
            ))}
          </div>
          {/* Progress indicator + Load more */}
          {totalResults > 0 && (
            <div className="mt-10 flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                <span className="text-xs font-bold text-kode01-noir/40 uppercase tracking-widest">
                  {filteredProducts.length} / {totalResults}
                </span>
                <div className="w-full h-1 rounded-full bg-kode01-pink/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-kode01-pink transition-all duration-500"
                    style={{ width: `${Math.min((filteredProducts.length / totalResults) * 100, 100)}%` }}
                  />
                </div>
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => {
                    void onLoadMore();
                  }}
                  disabled={loadingMore || isDegradedMode}
                  className="px-10 py-4 bg-kode01-noir text-white font-bold text-sm rounded-full transition-all duration-200 hover:bg-kode01-pink hover:text-kode01-noir uppercase tracking-widest border-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMore ? t('filters.loading_more') : t('filters.load_more')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
