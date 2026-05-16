import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryStates } from 'nuqs';

import type { PaginatedListState } from '@/lib/pagination/types';
import {
    DB_UNAVAILABLE_CODE,
    DB_UNAVAILABLE_STATUS,
    isDbUnavailableApiPayload,
    isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';
import {
    nextDataSafetyStateOnFailure,
    nextDataSafetyStateOnSuccess,
    type DataSafetyFailureCause,
    type DataSafetyState,
} from '@/lib/resilience/data-safety';

import { replaceHistoryNoScrollOptions } from '@/lib/url-query/parsers';
import { marketFilterParsers } from './market-query';
import type {
    MarketFilterType,
    MarketProduct,
    ProductCategoryRow,
    ProductSubcategoryRow,
    SortOption,
} from './market-types';

interface UseMarketDataArgs {
    locale: string;
    initialData?: MarketListApiResponse;
}

interface MarketListApiResponse {
    items?: MarketProduct[];
    categories?: ProductCategoryRow[];
    subcategories?: ProductSubcategoryRow[];
    availableTags?: string[];
    total?: number;
    hasMore?: boolean;
    nextOffset?: number | null;
}

interface UseMarketDataResult extends PaginatedListState<MarketProduct> {
    categories: ProductCategoryRow[];
    subcategories: ProductSubcategoryRow[];
    availableTags: string[];
    safetyState: DataSafetyState;
    loadMore: () => Promise<void>;
    refreshNow: () => Promise<void>;
}

const PAGE_LIMIT = 24;
const REQUEST_TIMEOUT_MS = 10_000;

interface MarketFilterParams {
    search: string;
    category: string;
    subcategories: string[];
    tags: string[];
    sort: SortOption;
    type: MarketFilterType;
}

function buildRequestParams(
    locale: string,
    offset: number,
    filters: MarketFilterParams,
    options: { includeFacets: boolean; includeTotal: boolean },
): URLSearchParams {
    const params = new URLSearchParams({
        locale,
        limit: String(PAGE_LIMIT),
        offset: String(offset),
        sort: filters.sort,
        type: filters.type,
        includeFacets: String(options.includeFacets),
        includeTotal: String(options.includeTotal),
    });

    if (filters.search) params.set('search', filters.search);
    if (filters.category) params.set('category', filters.category);
    if (filters.subcategories.length > 0) params.set('subcategories', filters.subcategories.join(','));
    if (filters.tags.length > 0) params.set('tags', filters.tags.join(','));

    return params;
}

function isDefaultFilters(filters: MarketFilterParams): boolean {
    return filters.search === ''
        && filters.category === ''
        && filters.subcategories.length === 0
        && filters.tags.length === 0
        && filters.sort === 'newest'
        && filters.type === 'all';
}

function createDbUnavailableRequestError(): Error {
    const error = new Error('Database unavailable');
    Object.assign(error, { code: DB_UNAVAILABLE_CODE });
    return error;
}

function isRequestAbortError(error: unknown): boolean {
    return error instanceof DOMException
        && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function useMarketData({ locale, initialData }: UseMarketDataArgs): UseMarketDataResult {
    const [query] = useQueryStates(marketFilterParsers, replaceHistoryNoScrollOptions);
    const requestIdRef = useRef(0);
    const activeRequestKeyRef = useRef<string | null>(null);
    const safetyStateRef = useRef<DataSafetyState>('ok');
    const filtersRef = useRef<MarketFilterParams>({
        search: '',
        category: '',
        subcategories: [],
        tags: [],
        sort: 'newest',
        type: 'all',
    });

    const [state, setState] = useState<PaginatedListState<MarketProduct>>({
        items: initialData?.items ?? [],
        loading: initialData ? false : true,
        loadingMore: false,
        total: typeof initialData?.total === 'number' ? initialData.total : 0,
        hasMore: Boolean(initialData?.hasMore),
        offset: typeof initialData?.nextOffset === 'number'
            ? initialData.nextOffset
            : (initialData?.items?.length ?? 0),
    });
    const [categories, setCategories] = useState<ProductCategoryRow[]>(initialData?.categories ?? []);
    const [subcategories, setSubcategories] = useState<ProductSubcategoryRow[]>(initialData?.subcategories ?? []);
    const [availableTags, setAvailableTags] = useState<string[]>(initialData?.availableTags ?? []);
    const [safetyState, setSafetyState] = useState<DataSafetyState>('ok');

    const filters = useMemo<MarketFilterParams>(() => ({
        search: query.search.trim(),
        category: query.category.trim(),
        subcategories: query.subcategories,
        tags: query.tags,
        sort: query.sort as SortOption,
        type: query.type as MarketFilterType,
    }), [query.category, query.search, query.sort, query.subcategories, query.tags, query.type]);

    const filtersKey = useMemo(
        () => JSON.stringify({
            search: filters.search,
            category: filters.category,
            subcategories: filters.subcategories,
            tags: filters.tags,
            sort: filters.sort,
            type: filters.type,
        }),
        [
            filters.search,
            filters.category,
            filters.subcategories,
            filters.tags,
            filters.sort,
            filters.type,
        ],
    );
    filtersRef.current = filters;
    safetyStateRef.current = safetyState;

    const fetchPage = useCallback(async (
        offset: number,
        append: boolean,
        activeFilters: MarketFilterParams,
        failureCause: DataSafetyFailureCause = 'auto',
    ) => {
        const requestKey = `${locale}:${offset}:${append ? 'append' : 'reset'}:${JSON.stringify(activeFilters)}`;
        if (activeRequestKeyRef.current === requestKey) return;
        activeRequestKeyRef.current = requestKey;

        const requestId = ++requestIdRef.current;
        const params = buildRequestParams(locale, offset, activeFilters, {
            includeFacets: !append,
            includeTotal: !append,
        });

        if (append) {
            setState((current) => (current.loadingMore ? current : { ...current, loadingMore: true }));
        } else {
            setState((current) => {
                const alreadyReset =
                    current.loading
                    && !current.loadingMore
                    && current.items.length === 0
                    && current.total === 0
                    && !current.hasMore
                    && current.offset === 0;
                if (alreadyReset) return current;
                return {
                    ...current,
                    loading: true,
                    loadingMore: false,
                    items: [],
                    total: 0,
                    hasMore: false,
                    offset: 0,
                };
            });
        }

        try {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => {
                controller.abort(new DOMException('Market list request timed out', 'TimeoutError'));
            }, REQUEST_TIMEOUT_MS);
            const response = await fetch(`/api/market/list?${params.toString()}`, {
                method: 'GET',
                signal: controller.signal,
            }).finally(() => {
                window.clearTimeout(timeoutId);
            });
            if (!response.ok) {
                const errorPayload = (await response.json().catch(() => null)) as unknown;
                if (response.status === DB_UNAVAILABLE_STATUS && isDbUnavailableApiPayload(errorPayload)) {
                    throw createDbUnavailableRequestError();
                }
                throw new Error(`Failed to fetch market list (${response.status})`);
            }

            const payload = (await response.json()) as MarketListApiResponse;
            if (requestId !== requestIdRef.current) return;

            const nextItems = payload.items ?? [];
            const resolvedTotal = typeof payload.total === 'number' ? payload.total : null;
            const hasMore = Boolean(payload.hasMore);
            const nextOffset =
                typeof payload.nextOffset === 'number'
                    ? payload.nextOffset
                    : offset + nextItems.length;

            if (!append) {
                setCategories(payload.categories ?? []);
                setSubcategories(payload.subcategories ?? []);
                setAvailableTags(payload.availableTags ?? []);
            }

            setState((current) => ({
                items: append ? [...current.items, ...nextItems] : nextItems,
                loading: false,
                loadingMore: false,
                total: resolvedTotal ?? (append ? current.total : 0),
                hasMore,
                offset: nextOffset,
            }));
            setSafetyState(nextDataSafetyStateOnSuccess());
        } catch (error) {
            const isAbortError = isRequestAbortError(error);
            if (!isAbortError) {
                console.error('Failed to fetch market data:', error);
            }
            if (requestId !== requestIdRef.current) return;
            if (!isAbortError && isTransientDbUnavailableError(error)) {
                setSafetyState((current) => nextDataSafetyStateOnFailure(current, failureCause));
            }
            setState((current) => ({
                ...current,
                items: append ? current.items : [],
                loading: false,
                loadingMore: false,
                total: append ? current.total : 0,
                hasMore: append ? current.hasMore : false,
                offset: append ? current.offset : 0,
            }));
            if (!append) {
                setCategories([]);
                setSubcategories([]);
                setAvailableTags([]);
            }
        } finally {
            if (activeRequestKeyRef.current === requestKey) {
                activeRequestKeyRef.current = null;
            }
        }
    }, [locale]);

    const skippedInitialRef = useRef(false);

    useEffect(() => {
        if (
            !skippedInitialRef.current
            && initialData
            && isDefaultFilters(filtersRef.current)
        ) {
            skippedInitialRef.current = true;
            return;
        }
        void fetchPage(0, false, filtersRef.current);
    }, [fetchPage, filtersKey, initialData]);

    const loadMore = useCallback(async () => {
        if (state.loading || state.loadingMore || !state.hasMore || safetyStateRef.current === 'degraded') return;
        await fetchPage(state.offset, true, filtersRef.current);
    }, [fetchPage, state.hasMore, state.loading, state.loadingMore, state.offset]);

    const refreshNow = useCallback(async () => {
        await fetchPage(0, false, filtersRef.current, 'manual_refresh');
    }, [fetchPage]);

    return {
        ...state,
        categories,
        subcategories,
        availableTags,
        safetyState,
        loadMore,
        refreshNow,
    };
}
