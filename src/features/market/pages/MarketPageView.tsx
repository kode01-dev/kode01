'use client';

import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import type { DataSafetyState } from '@/lib/resilience/data-safety';

import { MarketFiltersContent } from './MarketFiltersContent';
import { MarketFiltersSidebar } from './MarketFiltersSidebar';
import { MarketHeroSection } from './MarketHeroSection';
import { MarketMobileFiltersDrawer } from './MarketMobileFiltersDrawer';
import { MarketResultsContent } from './MarketResultsContent';
import { MarketResultsToolbar } from './MarketResultsToolbar';
import { ScrollToTopButton } from './ScrollToTopButton';
import type { ProductCategoryRow } from './market-types';
import type { MarketTranslationFn } from './market-utils';
import type { UseMarketFiltersResult } from './useMarketFilters';

interface MarketPageViewProps {
  t: MarketTranslationFn;
  locale: string;
  loading: boolean;
  loadingMore: boolean;
  totalResults: number;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  safetyState: DataSafetyState;
  onRefreshNow: () => Promise<void>;
  categories: ProductCategoryRow[];
  filters: UseMarketFiltersResult;
}

export function MarketPageView({
  t,
  locale,
  loading,
  loadingMore,
  totalResults,
  hasMore,
  onLoadMore,
  safetyState,
  onRefreshNow,
  categories,
  filters,
}: MarketPageViewProps): React.JSX.Element {
  const {
    searchTerm,
    selectedCategorySlug,
    selectedSubcategorySlugs,
    selectedTags,
    selectedType,
    sortOption,
    filteredProducts,
    hasActiveFilters,
    activeFilterCount,
    categoryBySlug,
    selectedCategory,
    selectedCategorySubcategories,
    availableTags,
    isMobileFiltersOpen,
    expandedSections,
    priceMin,
    priceMax,
    setPriceMin,
    setPriceMax,
    clearPriceRange,
    setSearchTerm,
    setSortOption,
    setSelectedType,
    clearFilters,
    clearCategory,
    selectCategory,
    toggleSubcategory,
    removeSubcategory,
    clearTags,
    toggleTag,
    removeTag,
    clearSearch,
    openMobileFilters,
    closeMobileFilters,
    toggleSection,
  } = filters;
  const clearType = () => setSelectedType('all');

  const desktopFilterContent = (
    <MarketFiltersContent
      idPrefix="market-desktop"
      t={t}
      locale={locale}
      selectedType={selectedType}
      categories={categories}
      selectedCategorySlug={selectedCategorySlug}
      selectedCategory={selectedCategory}
      selectedCategorySubcategories={selectedCategorySubcategories}
      selectedSubcategorySlugs={selectedSubcategorySlugs}
      availableTags={availableTags}
      selectedTags={selectedTags}
      expandedSections={expandedSections}
      priceMin={priceMin}
      priceMax={priceMax}
      setPriceMin={setPriceMin}
      setPriceMax={setPriceMax}
      clearPriceRange={clearPriceRange}
      clearCategory={clearCategory}
      setSelectedType={setSelectedType}
      selectCategory={selectCategory}
      toggleSubcategory={toggleSubcategory}
      clearTags={clearTags}
      toggleTag={toggleTag}
      toggleSection={toggleSection}
    />
  );

  const mobileFilterContent = (
    <MarketFiltersContent
      idPrefix="market-mobile"
      t={t}
      locale={locale}
      hideCategoryFilter
      selectedType={selectedType}
      categories={categories}
      selectedCategorySlug={selectedCategorySlug}
      selectedCategory={selectedCategory}
      selectedCategorySubcategories={selectedCategorySubcategories}
      selectedSubcategorySlugs={selectedSubcategorySlugs}
      availableTags={availableTags}
      selectedTags={selectedTags}
      expandedSections={expandedSections}
      priceMin={priceMin}
      priceMax={priceMax}
      setPriceMin={setPriceMin}
      setPriceMax={setPriceMax}
      clearPriceRange={clearPriceRange}
      clearCategory={clearCategory}
      setSelectedType={setSelectedType}
      selectCategory={selectCategory}
      toggleSubcategory={toggleSubcategory}
      clearTags={clearTags}
      toggleTag={toggleTag}
      toggleSection={toggleSection}
    />
  );

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
      <BaseHeader />

      <main className="flex-1 pt-32">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
          <MarketHeroSection
            t={t}
            locale={locale}
            loading={loading}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            totalResults={totalResults}
          />

          <div className="pb-24">
            <div className="flex flex-col lg:flex-row gap-12">
              <MarketFiltersSidebar
                t={t}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                clearFilters={clearFilters}
              >
                {desktopFilterContent}
              </MarketFiltersSidebar>

              <div className="flex-1">
                <MarketResultsToolbar
                  t={t}
                  totalResults={totalResults}
                  hasActiveFilters={hasActiveFilters}
                  activeFilterCount={activeFilterCount}
                  openMobileFilters={openMobileFilters}
                  sortOption={sortOption}
                  setSortOption={setSortOption}
                />

                <MarketResultsContent
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
                  safetyState={safetyState}
                  loading={loading}
                  filteredProducts={filteredProducts}
                  totalResults={totalResults}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={onLoadMore}
                  onRefreshNow={onRefreshNow}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <MarketMobileFiltersDrawer
        t={t}
        locale={locale}
        isOpen={isMobileFiltersOpen}
        closeMobileFilters={closeMobileFilters}
        clearFilters={clearFilters}
        categories={categories}
        selectedCategorySlug={selectedCategorySlug}
        selectCategory={selectCategory}
        clearCategory={clearCategory}
        sortOption={sortOption}
        setSortOption={setSortOption}
      >
        {mobileFilterContent}
      </MarketMobileFiltersDrawer>

      <ScrollToTopButton />
      <BaseFooter />
    </div>
  );
}
