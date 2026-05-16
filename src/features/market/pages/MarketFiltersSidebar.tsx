import type { ReactNode } from 'react';

import type { MarketTranslationFn } from './market-utils';

interface MarketFiltersSidebarProps {
  t: MarketTranslationFn;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
  children: ReactNode;
}

export function MarketFiltersSidebar({
  t,
  hasActiveFilters,
  activeFilterCount,
  clearFilters,
  children,
}: MarketFiltersSidebarProps): React.JSX.Element {
  return (
    <div className="hidden lg:block w-72 flex-shrink-0">
      <div
        id="market-filters-sidebar"
        className="bg-white rounded-[32px] border border-black/5 shadow-sm sticky top-32 max-h-[calc(100vh-160px)] flex flex-col overflow-hidden"
      >
        {/* Fixed Header */}
        <div className="p-8 pb-4 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <h3 className="font-serif font-black text-2xl text-kode01-noir lowercase tracking-tight">
              {t('filters.title')}
            </h3>
            {hasActiveFilters && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-kode01-pink text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              id="market-filters-clear-all-desktop"
              onClick={clearFilters}
              className="text-[10px] font-bold text-kode01-pink hover:text-kode01-noir transition-all uppercase tracking-widest border-b border-kode01-pink/30 hover:border-kode01-noir cursor-pointer"
            >
              {t('filters.clear_all')}
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}
