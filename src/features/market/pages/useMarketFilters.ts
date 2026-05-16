import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryStates } from 'nuqs';

import { replaceHistoryNoScrollOptions } from '@/lib/url-query/parsers';

import { marketFilterParsers } from './market-query';
import type {
  ExpandedSectionsState,
  MarketFilterType,
  MarketProduct,
  ProductCategoryRow,
  ProductSubcategoryRow,
  SortOption,
} from './market-types';

interface UseMarketFiltersArgs {
  categories: ProductCategoryRow[];
  subcategories: ProductSubcategoryRow[];
  products: MarketProduct[];
  availableTags: string[];
}

export interface UseMarketFiltersResult {
  searchTerm: string;
  selectedCategorySlug: string;
  selectedSubcategorySlugs: string[];
  selectedTags: string[];
  selectedType: MarketFilterType;
  sortOption: SortOption;
  filteredProducts: MarketProduct[];
  hasActiveFilters: boolean;
  activeFilterCount: number;
  categoryBySlug: Map<string, ProductCategoryRow>;
  selectedCategory: ProductCategoryRow | null;
  selectedCategorySubcategories: ProductSubcategoryRow[];
  availableTags: string[];
  isMobileFiltersOpen: boolean;
  expandedSections: ExpandedSectionsState;
  priceMin: number;
  priceMax: number;
  setPriceMin: (value: number) => void;
  setPriceMax: (value: number) => void;
  clearPriceRange: () => void;
  setSearchTerm: (value: string) => void;
  setSortOption: (value: SortOption) => void;
  setSelectedType: (value: MarketFilterType) => void;
  clearFilters: () => void;
  clearCategory: () => void;
  selectCategory: (slug: string) => void;
  toggleSubcategory: (slug: string) => void;
  removeSubcategory: (slug: string) => void;
  clearTags: () => void;
  toggleTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  clearSearch: () => void;
  openMobileFilters: () => void;
  closeMobileFilters: () => void;
  toggleSection: (section: keyof ExpandedSectionsState) => void;
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useMarketFilters({
  categories,
  subcategories,
  products,
  availableTags,
}: UseMarketFiltersArgs): UseMarketFiltersResult {
  const [query, setQuery] = useQueryStates(
    marketFilterParsers,
    replaceHistoryNoScrollOptions,
  );
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<ExpandedSectionsState>({
    type: true,
    price: false,
    category: true,
    subcategory: false,
    tags: false,
  });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileFiltersOpen) {
        setIsMobileFiltersOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isMobileFiltersOpen]);

  const categoryBySlug = useMemo(() => {
    return new Map(categories.map((category) => [category.slug, category]));
  }, [categories]);

  const subcategoriesByCategoryId = useMemo(() => {
    const map = new Map<string, ProductSubcategoryRow[]>();
    subcategories.forEach((subcategory) => {
      const current = map.get(subcategory.category_id) ?? [];
      current.push(subcategory);
      map.set(subcategory.category_id, current);
    });
    return map;
  }, [subcategories]);

  const selectedCategory = query.category
    ? categoryBySlug.get(query.category) ?? null
    : null;

  const selectedCategorySubcategories = useMemo(() => {
    if (!selectedCategory) return [] as ProductSubcategoryRow[];
    return subcategoriesByCategoryId.get(selectedCategory.id) ?? [];
  }, [selectedCategory, subcategoriesByCategoryId]);

  const selectedSubcategorySlugs = useMemo(() => {
    if (!query.category) return [] as string[];
    const allowedSelectedSubcategorySlugs = new Set(
      selectedCategorySubcategories.map((item) => item.slug),
    );
    return query.subcategories.filter((slug) =>
      allowedSelectedSubcategorySlugs.has(slug),
    );
  }, [query.category, query.subcategories, selectedCategorySubcategories]);

  useEffect(() => {
    if (areStringArraysEqual(selectedSubcategorySlugs, query.subcategories)) {
      return;
    }
    void setQuery({
      subcategories:
        selectedSubcategorySlugs.length > 0 ? selectedSubcategorySlugs : null,
    });
  }, [query.subcategories, selectedSubcategorySlugs, setQuery]);

  const filteredProducts = useMemo(() => {
    const min = query.price_min;
    const max = query.price_max;
    if (min <= 0 && max <= 0) return products;
    return products.filter((product) => {
      if (min > 0 && product.price < min) return false;
      if (max > 0 && product.price > max) return false;
      return true;
    });
  }, [products, query.price_min, query.price_max]);

  const setSearchTerm = useCallback(
    (value: string) => {
      void setQuery({ search: value.trim() ? value : null });
    },
    [setQuery],
  );

  const setSortOption = useCallback(
    (value: SortOption) => {
      void setQuery({ sort: value });
    },
    [setQuery],
  );

  const setSelectedType = useCallback(
    (value: MarketFilterType) => {
      void setQuery({ type: value === 'all' ? null : value });
    },
    [setQuery],
  );

  const clearSearch = useCallback(() => {
    void setQuery({ search: null });
  }, [setQuery]);

  const clearCategory = useCallback(() => {
    void setQuery({
      category: null,
      subcategories: null,
    });
  }, [setQuery]);

  const selectCategory = useCallback(
    (slug: string) => {
      void setQuery({
        category: slug,
        subcategories: null,
      });
    },
    [setQuery],
  );

  const toggleSubcategory = useCallback(
    (slug: string) => {
      const next = selectedSubcategorySlugs.includes(slug)
        ? selectedSubcategorySlugs.filter((entry) => entry !== slug)
        : [...selectedSubcategorySlugs, slug];
      void setQuery({
        subcategories: next.length > 0 ? next : null,
      });
    },
    [selectedSubcategorySlugs, setQuery],
  );

  const removeSubcategory = useCallback(
    (slug: string) => {
      const next = selectedSubcategorySlugs.filter((entry) => entry !== slug);
      void setQuery({
        subcategories: next.length > 0 ? next : null,
      });
    },
    [selectedSubcategorySlugs, setQuery],
  );

  const clearTags = useCallback(() => {
    void setQuery({ tags: null });
  }, [setQuery]);

  const toggleTag = useCallback(
    (tag: string) => {
      const next = query.tags.includes(tag)
        ? query.tags.filter((entry) => entry !== tag)
        : [...query.tags, tag];
      void setQuery({
        tags: next.length > 0 ? next : null,
      });
    },
    [query.tags, setQuery],
  );

  const removeTag = useCallback(
    (tag: string) => {
      const next = query.tags.filter((entry) => entry !== tag);
      void setQuery({
        tags: next.length > 0 ? next : null,
      });
    },
    [query.tags, setQuery],
  );

  const setPriceMin = useCallback(
    (value: number) => {
      void setQuery({ price_min: value > 0 ? value : null });
    },
    [setQuery],
  );

  const setPriceMax = useCallback(
    (value: number) => {
      void setQuery({ price_max: value > 0 ? value : null });
    },
    [setQuery],
  );

  const clearPriceRange = useCallback(() => {
    void setQuery({ price_min: null, price_max: null });
  }, [setQuery]);

  const clearFilters = useCallback(() => {
    void setQuery({
      search: null,
      category: null,
      subcategories: null,
      tags: null,
      sort: null,
      type: null,
      price_min: null,
      price_max: null,
    });
  }, [setQuery]);

  const openMobileFilters = useCallback(() => {
    setIsMobileFiltersOpen(true);
  }, []);

  const closeMobileFilters = useCallback(() => {
    setIsMobileFiltersOpen(false);
  }, []);

  const toggleSection = useCallback((section: keyof ExpandedSectionsState) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const hasPriceFilter = query.price_min > 0 || query.price_max > 0;

  const hasActiveFilters = query.category !== ''
    || selectedSubcategorySlugs.length > 0
    || query.tags.length > 0
    || query.search.trim() !== ''
    || query.type !== 'all'
    || hasPriceFilter;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query.category) count += 1;
    count += selectedSubcategorySlugs.length;
    count += query.tags.length;
    if (query.search.trim()) count += 1;
    if (query.type !== 'all') count += 1;
    if (query.price_min > 0 || query.price_max > 0) count += 1;
    return count;
  }, [query.category, selectedSubcategorySlugs, query.tags, query.search, query.type, query.price_min, query.price_max]);

  return {
    searchTerm: query.search,
    selectedCategorySlug: query.category,
    selectedSubcategorySlugs,
    selectedTags: query.tags,
    selectedType: query.type as MarketFilterType,
    sortOption: query.sort as SortOption,
    filteredProducts,
    hasActiveFilters,
    activeFilterCount,
    categoryBySlug,
    selectedCategory,
    selectedCategorySubcategories,
    availableTags,
    isMobileFiltersOpen,
    expandedSections,
    priceMin: query.price_min,
    priceMax: query.price_max,
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
  };
}
