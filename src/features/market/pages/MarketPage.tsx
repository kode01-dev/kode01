'use client';

import { useLocale, useTranslations } from 'next-intl';

import { MarketPageView } from './MarketPageView';
import type { MarketTranslationFn } from './market-utils';
import { useMarketData } from './useMarketData';
import { useMarketFilters } from './useMarketFilters';
import type { MarketProduct, ProductCategoryRow, ProductSubcategoryRow } from './market-types';

interface MarketPageProps {
    initialData?: {
        items: MarketProduct[];
        categories: ProductCategoryRow[];
        subcategories: ProductSubcategoryRow[];
        availableTags: string[];
        total: number;
        hasMore: boolean;
        nextOffset: number | null;
    };
}

export function MarketPage({ initialData }: MarketPageProps): React.JSX.Element {
    const t = useTranslations('market');
    const locale = useLocale();

    const translation = t as unknown as MarketTranslationFn;
    const {
        loading,
        loadingMore,
        items: products,
        categories,
        subcategories,
        availableTags,
        safetyState,
        total,
        hasMore,
        loadMore,
        refreshNow,
    } = useMarketData({
        locale,
        initialData,
    });

    const filters = useMarketFilters({
        categories,
        subcategories,
        products,
        availableTags,
    });

    return (
        <MarketPageView
            t={translation}
            locale={locale}
            loading={loading}
            loadingMore={loadingMore}
            totalResults={total}
            hasMore={hasMore}
            onLoadMore={loadMore}
            safetyState={safetyState}
            onRefreshNow={refreshNow}
            categories={categories}
            filters={filters}
        />
    );
}
