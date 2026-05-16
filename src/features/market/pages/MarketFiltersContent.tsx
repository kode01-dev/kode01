import { ChevronDown, ChevronUp, DollarSign, Filter, Tag } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';

import { getLocalizedName, safeTaxonomyTranslation, type MarketTranslationFn } from './market-utils';
import type {
  ExpandedSectionsState,
  MarketFilterType,
  ProductCategoryRow,
  ProductSubcategoryRow,
} from './market-types';

interface FilterSectionProps {
  idPrefix: string;
  sectionKey: keyof ExpandedSectionsState;
  title: string;
  icon: ReactNode;
  isExpanded: boolean;
  onToggle: (section: keyof ExpandedSectionsState) => void;
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

function FilterSection({
  idPrefix,
  sectionKey,
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: FilterSectionProps): React.JSX.Element {
  const sectionPanelId = `${idPrefix}-filter-panel-${sectionKey}`;
  const sectionToggleId = `${idPrefix}-filter-toggle-${sectionKey}`;

  return (
    <div>
      <button
        id={sectionToggleId}
        onClick={() => onToggle(sectionKey)}
        className="flex items-center justify-between w-full text-left mb-6 group"
        aria-expanded={isExpanded}
        aria-controls={sectionPanelId}
      >
        <div className="flex items-center gap-2">
          {icon && <div className="text-kode01-noir/30">{icon}</div>}
          <span className="text-xs font-bold text-kode01-noir opacity-40 uppercase tracking-widest">
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-kode01-noir/20 group-hover:text-kode01-pink transition-colors" />
        ) : (
          <ChevronDown size={16} className="text-kode01-noir/20 group-hover:text-kode01-pink transition-colors" />
        )}
      </button>

      <div
        id={sectionPanelId}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isExpanded ? '500px' : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="flex flex-wrap gap-2.5">{children}</div>
      </div>
    </div>
  );
}

interface PriceRangeSectionProps {
  idPrefix: string;
  locale: string;
  isExpanded: boolean;
  onToggle: () => void;
  priceMin: number;
  priceMax: number;
  setPriceMin: (value: number) => void;
  setPriceMax: (value: number) => void;
  clearPriceRange: () => void;
}

function PriceRangeSection({
  idPrefix,
  locale,
  isExpanded,
  onToggle,
  priceMin,
  priceMax,
  setPriceMin,
  setPriceMax,
  clearPriceRange,
}: PriceRangeSectionProps): React.JSX.Element {
  const [localMin, setLocalMin] = useState(priceMin > 0 ? String(priceMin) : '');
  const [localMax, setLocalMax] = useState(priceMax > 0 ? String(priceMax) : '');

  const applyPrice = () => {
    const min = parseInt(localMin, 10);
    const max = parseInt(localMax, 10);
    setPriceMin(Number.isNaN(min) || min <= 0 ? 0 : min);
    setPriceMax(Number.isNaN(max) || max <= 0 ? 0 : max);
  };

  const handleClear = () => {
    setLocalMin('');
    setLocalMax('');
    clearPriceRange();
  };

  const hasPriceActive = priceMin > 0 || priceMax > 0;
  const priceLabel = locale === 'fr' ? 'Prix' : 'Price';

  return (
    <div>
      <button
        id={`${idPrefix}-filter-toggle-price`}
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left mb-6 group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <div className="text-kode01-noir/30"><DollarSign size={14} /></div>
          <span className="text-xs font-bold text-kode01-noir opacity-40 uppercase tracking-widest">
            {priceLabel}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-kode01-noir/20 group-hover:text-kode01-pink transition-colors" />
        ) : (
          <ChevronDown size={16} className="text-kode01-noir/20 group-hover:text-kode01-pink transition-colors" />
        )}
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? '200px' : '0px', opacity: isExpanded ? 1 : 0 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <input
            id={`${idPrefix}-filter-price-min`}
            type="number"
            min="0"
            placeholder="Min"
            value={localMin}
            onChange={(e) => setLocalMin(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPrice(); }}
            className="w-20 px-3 py-2.5 rounded-xl border border-black/10 text-sm text-center bg-white text-kode01-noir placeholder:text-kode01-noir/30 focus:outline-none focus:border-kode01-pink/50"
          />
          <span className="text-kode01-noir/30 text-sm font-bold">—</span>
          <input
            id={`${idPrefix}-filter-price-max`}
            type="number"
            min="0"
            placeholder="Max"
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPrice(); }}
            className="w-20 px-3 py-2.5 rounded-xl border border-black/10 text-sm text-center bg-white text-kode01-noir placeholder:text-kode01-noir/30 focus:outline-none focus:border-kode01-pink/50"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyPrice}
            className="px-4 py-2 rounded-full bg-kode01-pink text-kode01-noir text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all hover:shadow-sm"
          >
            {locale === 'fr' ? 'Appliquer' : 'Apply'}
          </button>
          {hasPriceActive && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 rounded-full bg-kode01-cream/50 text-kode01-noir/60 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all hover:text-kode01-noir"
            >
              {locale === 'fr' ? 'Effacer' : 'Clear'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface MarketFiltersContentProps {
  idPrefix: string;
  t: MarketTranslationFn;
  locale: string;
  selectedType: MarketFilterType;
  categories: ProductCategoryRow[];
  selectedCategorySlug: string;
  selectedCategory: ProductCategoryRow | null;
  selectedCategorySubcategories: ProductSubcategoryRow[];
  selectedSubcategorySlugs: string[];
  availableTags: string[];
  selectedTags: string[];
  expandedSections: ExpandedSectionsState;
  priceMin: number;
  priceMax: number;
  setPriceMin: (value: number) => void;
  setPriceMax: (value: number) => void;
  clearPriceRange: () => void;
  hideCategoryFilter?: boolean;
  clearCategory: () => void;
  setSelectedType: (value: MarketFilterType) => void;
  selectCategory: (slug: string) => void;
  toggleSubcategory: (slug: string) => void;
  clearTags: () => void;
  toggleTag: (tag: string) => void;
  toggleSection: (section: keyof ExpandedSectionsState) => void;
}

export function MarketFiltersContent({
  idPrefix,
  t,
  locale,
  selectedType,
  categories,
  selectedCategorySlug,
  selectedCategory,
  selectedCategorySubcategories,
  selectedSubcategorySlugs,
  availableTags,
  selectedTags,
  expandedSections,
  priceMin,
  priceMax,
  setPriceMin,
  setPriceMax,
  hideCategoryFilter,
  clearPriceRange,
  clearCategory,
  setSelectedType,
  selectCategory,
  toggleSubcategory,
  clearTags,
  toggleTag,
  toggleSection,
}: MarketFiltersContentProps): React.JSX.Element {
  const typeLabels = {
    all: locale === 'fr' ? 'Tous' : 'All',
    product: locale === 'fr' ? 'Produits' : 'Products',
    bundle: locale === 'fr' ? 'Bundles' : 'Bundles',
  } as const;

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <h4 className="text-[10px] font-black text-kode01-noir/30 uppercase tracking-widest">
          {t('filters.primary_filters')}
        </h4>
        <div className="space-y-8">
          <FilterSection
            idPrefix={idPrefix}
            sectionKey="type"
            title={locale === 'fr' ? 'Type' : 'Type'}
            icon={<Tag size={14} />}
            isExpanded={expandedSections.type}
            onToggle={toggleSection}
          >
            {(['all', 'product', 'bundle'] as const).map((typeOption) => {
              const isActive = selectedType === typeOption;
              return (
                <button
                  key={typeOption}
                  id={`${idPrefix}-filter-type-${typeOption}`}
                  onClick={() => setSelectedType(typeOption)}
                  className={cn(
                    'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                    isActive
                      ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                      : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                  )}
                >
                  {typeLabels[typeOption]}
                </button>
              );
            })}
          </FilterSection>

          <PriceRangeSection
            idPrefix={idPrefix}
            locale={locale}
            isExpanded={expandedSections.price}
            onToggle={() => toggleSection('price')}
            priceMin={priceMin}
            priceMax={priceMax}
            setPriceMin={setPriceMin}
            setPriceMax={setPriceMax}
            clearPriceRange={clearPriceRange}
          />

          {!hideCategoryFilter && (
            <FilterSection
              idPrefix={idPrefix}
              sectionKey="category"
              title={t('filters.category')}
              icon={<Filter size={14} />}
              isExpanded={expandedSections.category}
              onToggle={toggleSection}
            >
              <button
                id={`${idPrefix}-filter-category-all`}
                onClick={clearCategory}
                className={cn(
                  'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
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
                    id={`${idPrefix}-filter-category-${sanitizeIdSegment(category.slug)}`}
                    onClick={() => selectCategory(category.slug)}
                    className={cn(
                      'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                      isActive
                        ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                        : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </FilterSection>
          )}

          {selectedCategory && selectedCategorySubcategories.length > 0 && (
            <FilterSection
              idPrefix={idPrefix}
              sectionKey="subcategory"
              title={t('filters.subcategories')}
              icon={<Tag size={14} />}
              isExpanded={expandedSections.subcategory}
              onToggle={toggleSection}
            >
              {selectedCategorySubcategories.map((subcategory) => {
                const fallbackLabel = getLocalizedName(
                  locale,
                  subcategory.name_en,
                  subcategory.name_fr,
                  subcategory.slug,
                );
                const label = safeTaxonomyTranslation(
                  t,
                  `taxonomy.subcategories.${subcategory.slug}`,
                  fallbackLabel,
                );
                const isActive = selectedSubcategorySlugs.includes(subcategory.slug);

                return (
                  <button
                    key={subcategory.id}
                    id={`${idPrefix}-filter-subcategory-${sanitizeIdSegment(subcategory.slug)}`}
                    onClick={() => toggleSubcategory(subcategory.slug)}
                    className={cn(
                      'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                      isActive
                        ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                        : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </FilterSection>
          )}

          {availableTags.length > 0 && (
            <FilterSection
              idPrefix={idPrefix}
              sectionKey="tags"
              title={t('filters.tags')}
              icon={<Tag size={14} />}
              isExpanded={expandedSections.tags}
              onToggle={toggleSection}
            >
              <button
                id={`${idPrefix}-filter-tag-all`}
                onClick={clearTags}
                className={cn(
                  'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                  selectedTags.length === 0
                    ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                    : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                )}
              >
                {t('filters.tags_all')}
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  id={`${idPrefix}-filter-tag-${sanitizeIdSegment(tag)}`}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 border cursor-pointer',
                    selectedTags.includes(tag)
                      ? 'bg-kode01-pink border-kode01-pink text-kode01-noir shadow-sm'
                      : 'bg-white border-black/5 text-kode01-noir/60 hover:border-kode01-pink hover:text-kode01-noir',
                  )}
                >
                  {tag}
                </button>
              ))}
            </FilterSection>
          )}
        </div>
      </div>
    </div>
  );
}
