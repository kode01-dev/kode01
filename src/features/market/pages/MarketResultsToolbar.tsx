import { Filter } from 'lucide-react';

import { parseSort, type MarketTranslationFn } from './market-utils';
import type { SortOption } from './market-types';

interface MarketResultsToolbarProps {
  t: MarketTranslationFn;
  totalResults: number;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  openMobileFilters: () => void;
  sortOption: SortOption;
  setSortOption: (value: SortOption) => void;
}

export function MarketResultsToolbar({
  t,
  totalResults,
  hasActiveFilters,
  activeFilterCount,
  openMobileFilters,
  sortOption,
  setSortOption,
}: MarketResultsToolbarProps): React.JSX.Element {
  return (
    <>
      {/* Mobile toolbar — with sort + filters */}
      <div className="lg:hidden mb-8 flex items-center justify-between gap-2 bg-white/50 backdrop-blur-md border border-black/5 p-3 sticky top-4 rounded-3xl z-30">
        <span className="font-bold text-xs text-kode01-noir opacity-50 shrink-0 hidden min-[400px]:block">
          {t('filters.found_count', { count: totalResults })}
        </span>

        <select
          id="market-filters-sort-select-mobile"
          value={sortOption}
          onChange={(event) => setSortOption(parseSort(event.target.value))}
          className="px-3 py-1.5 rounded-full border border-kode01-noir/10 bg-white text-kode01-noir text-xs font-medium focus:outline-none focus:ring-2 focus:ring-kode01-pink/30 cursor-pointer min-w-0"
        >
          <option value="newest">{t('filters.sort_newest')}</option>
          <option value="price_asc">{t('filters.sort_price_asc')}</option>
          <option value="price_desc">{t('filters.sort_price_desc')}</option>
        </select>

        <button
          id="market-filters-open-mobile"
          onClick={openMobileFilters}
          className="flex items-center gap-2 px-5 py-2 bg-kode01-noir text-white font-bold rounded-full text-xs transition-colors active:bg-kode01-pink active:text-kode01-noir uppercase tracking-widest cursor-pointer relative shrink-0"
        >
          <Filter size={14} />
          {t('filters.title')}
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-kode01-pink text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Desktop toolbar */}
      <div className="hidden lg:flex justify-between items-center mb-10">
        <h2 className="text-kode01-noir/40 font-bold text-sm uppercase tracking-widest">
          {t('filters.found_count', { count: totalResults })}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-kode01-noir/40 uppercase tracking-widest">
            {t('filters.sort')}
          </span>
          <select
            id="market-filters-sort-select"
            value={sortOption}
            onChange={(event) => setSortOption(parseSort(event.target.value))}
            className="px-4 py-2 rounded-full border border-kode01-noir/10 bg-white text-kode01-noir text-xs font-medium focus:outline-none focus:ring-2 focus:ring-kode01-pink/30 cursor-pointer"
          >
            <option value="newest">{t('filters.sort_newest')}</option>
            <option value="price_asc">{t('filters.sort_price_asc')}</option>
            <option value="price_desc">{t('filters.sort_price_desc')}</option>
          </select>
        </div>
      </div>
    </>
  );
}
