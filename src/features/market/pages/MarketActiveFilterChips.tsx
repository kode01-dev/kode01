import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { getLocalizedName, safeTaxonomyTranslation, type MarketTranslationFn } from './market-utils';
import type {
  ActiveFilterChip,
  MarketFilterType,
  ProductCategoryRow,
  ProductSubcategoryRow,
} from './market-types';

function sanitizeIdSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

interface MarketActiveFilterChipsProps {
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
}

export function MarketActiveFilterChips({
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
}: MarketActiveFilterChipsProps): React.JSX.Element | null {
  if (!hasActiveFilters) return null;

  const chips: ActiveFilterChip[] = [];

  if (selectedType !== 'all') {
    chips.push({
      type: 'type',
      value: selectedType,
      label:
        selectedType === 'bundle'
          ? locale === 'fr'
            ? 'Bundles'
            : 'Bundles'
          : locale === 'fr'
            ? 'Produits'
            : 'Products',
    });
  }

  if (searchTerm.trim()) {
    chips.push({ type: 'search', value: searchTerm.trim(), label: `"${searchTerm.trim()}"` });
  }

  if (selectedCategorySlug) {
    const category = categoryBySlug.get(selectedCategorySlug);
    const label = category
      ? safeTaxonomyTranslation(
          t,
          `taxonomy.categories.${category.slug}`,
          getLocalizedName(locale, category.name_en, category.name_fr, category.slug),
        )
      : selectedCategorySlug;
    chips.push({ type: 'category', value: selectedCategorySlug, label });
  }

  selectedSubcategorySlugs.forEach((slug) => {
    const subcategory = selectedCategorySubcategories.find((item) => item.slug === slug);
    const label = subcategory
      ? safeTaxonomyTranslation(
          t,
          `taxonomy.subcategories.${subcategory.slug}`,
          getLocalizedName(locale, subcategory.name_en, subcategory.name_fr, subcategory.slug),
        )
      : slug;
    chips.push({ type: 'subcategory', value: slug, label });
  });

  selectedTags.forEach((tag) => {
    chips.push({ type: 'tag', value: tag, label: tag });
  });

  if (priceMin > 0 || priceMax > 0) {
    const parts: string[] = [];
    if (priceMin > 0) parts.push(`≥ $${priceMin}`);
    if (priceMax > 0) parts.push(`≤ $${priceMax}`);
    chips.push({ type: 'price', value: 'price-range', label: parts.join(' – ') });
  }

  return (
    <div className="animate-in fade-in duration-200 space-y-3 mb-8">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, index) => (
          <button
            key={`${chip.type}-${chip.value}-${index}`}
            id={`market-active-filter-chip-${chip.type}-${sanitizeIdSegment(chip.value)}-${index}`}
            onClick={() => {
              if (chip.type === 'search') {
                clearSearch();
                return;
              }
              if (chip.type === 'category') {
                clearCategory();
                return;
              }
              if (chip.type === 'type') {
                clearType();
                return;
              }
              if (chip.type === 'subcategory') {
                removeSubcategory(chip.value);
                return;
              }
              if (chip.type === 'price') {
                clearPriceRange();
                return;
              }
              removeTag(chip.value);
            }}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              'border transition-all duration-200 cursor-pointer',
              'bg-kode01-pink/10 border-kode01-pink/30 text-kode01-noir',
              'hover:bg-kode01-pink/20 hover:border-kode01-pink/50',
              'group',
            )}
          >
            <span className="truncate max-w-[150px] text-kode01-noir/80">{chip.label}</span>
            <X size={14} className="text-kode01-noir/50 group-hover:text-kode01-pink transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
      {chips.length >= 2 && (
        <div className="pt-1">
          <button
            id="market-active-filters-clear-all"
            onClick={clearFilters}
            className="text-xs font-bold text-kode01-pink/70 hover:text-kode01-pink transition-colors cursor-pointer underline-offset-2 hover:underline"
          >
            {t('filters.clear_all')}
          </button>
        </div>
      )}
    </div>
  );
}
