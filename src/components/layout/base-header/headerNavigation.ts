'use client';

import { useCallback } from 'react';
import type React from 'react';
import type { ReadonlyURLSearchParams } from 'next/navigation';

interface UseHeaderNavigationGuardArgs {
    pathname: string;
    searchParams: ReadonlyURLSearchParams | null;
}

export const buildCategoryHref = (categorySlug: string): string =>
    `/market?category=${encodeURIComponent(categorySlug)}`;

export const buildSubcategoryHref = (categorySlug: string, subcategorySlug: string): string =>
    `/market?category=${encodeURIComponent(categorySlug)}&subcategories=${encodeURIComponent(subcategorySlug)}`;

const normalizeQueryString = (params: URLSearchParams): string =>
    [...params.entries()]
        .sort(([aKey, aValue], [bKey, bValue]) => {
            if (aKey === bKey) return aValue.localeCompare(bValue);
            return aKey.localeCompare(bKey);
        })
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

export function useHeaderNavigationGuard({
    pathname,
    searchParams,
}: UseHeaderNavigationGuardArgs) {
    const isCurrentHref = useCallback(
        (href: string): boolean => {
            const [hrefPath, hrefQuery = ''] = href.split('?');
            if (hrefPath !== pathname) return false;

            const currentParams = new URLSearchParams(searchParams?.toString() ?? '');
            const targetParams = new URLSearchParams(hrefQuery);
            return normalizeQueryString(currentParams) === normalizeQueryString(targetParams);
        },
        [pathname, searchParams],
    );

    const preventRedundantNavigation = useCallback(
        (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (isCurrentHref(href)) {
                event.preventDefault();
            }
        },
        [isCurrentHref],
    );

    return {
        preventRedundantNavigation,
    };
}
