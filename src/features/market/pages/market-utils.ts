import { SORT_OPTIONS, type SortOption } from './market-types';

type TranslationValues = Record<string, string | number | Date | null | undefined>;
export type MarketTranslationFn = ((key: string, values?: TranslationValues) => string) & {
    has?: (key: string) => boolean;
};

export function parseSort(value: string | null): SortOption {
    if (value && SORT_OPTIONS.includes(value as SortOption)) {
        return value as SortOption;
    }
    return 'newest';
}

export function parseSubcategoryList(value: string | null): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

export function parseList(value: string | null): string[] {
    if (!value) return [];
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return tags.filter((value): value is string => typeof value === 'string');
}

export function safeTaxonomyTranslation(
    t: MarketTranslationFn,
    key: string,
    fallback: string,
): string {
    if (typeof t.has === 'function' && !t.has(key)) {
        return fallback;
    }

    try {
        return t(key);
    } catch {
        return fallback;
    }
}

export function getLocalizedName(
    locale: string,
    englishName: string | null | undefined,
    frenchName: string | null | undefined,
    fallback: string,
): string {
    if (locale === 'fr') return frenchName || englishName || fallback;
    return englishName || frenchName || fallback;
}

export function formatPrice(price: number, locale: string): string {
    const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
        style: 'currency',
        currency: 'CAD',
        maximumFractionDigits: 0,
    });
    return formatter.format(price);
}
