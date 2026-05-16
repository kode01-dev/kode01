export type ApiContentTranslationStatus = 'translated' | 'not_translated' | 'unverified';

type SupportedApiLocale = 'fr' | 'en';

const STATUS_PRIORITY: Record<ApiContentTranslationStatus, number> = {
    translated: 0,
    unverified: 1,
    not_translated: 2,
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeApiLocale(locale?: string | null): SupportedApiLocale {
    return locale === 'fr' ? 'fr' : 'en';
}

function getOtherLocale(locale: SupportedApiLocale): SupportedApiLocale {
    return locale === 'fr' ? 'en' : 'fr';
}

function normalizeSourceLocale(locale?: string | null): SupportedApiLocale | null {
    if (locale === 'fr' || locale === 'en') return locale;
    return null;
}

function normalizeContentLocales(locales: unknown): SupportedApiLocale[] {
    if (!Array.isArray(locales)) return [];
    const normalized = new Set<SupportedApiLocale>();

    for (const locale of locales) {
        if (locale === 'fr' || locale === 'en') {
            normalized.add(locale);
        }
    }

    return Array.from(normalized);
}

export function inferStatusFromLocalizedRecord(
    localizedRecord: Record<string, string | null | undefined> | null | undefined,
    requestedLocale: string,
    sourceLocale?: string | null,
): ApiContentTranslationStatus {
    const locale = normalizeApiLocale(requestedLocale);
    const otherLocale = getOtherLocale(locale);
    const requestedValue = localizedRecord?.[locale];
    const otherValue = localizedRecord?.[otherLocale];

    if (isNonEmptyString(requestedValue)) return 'translated';
    if (isNonEmptyString(otherValue)) return 'not_translated';

    const normalizedSourceLocale = normalizeSourceLocale(sourceLocale);
    if (normalizedSourceLocale) {
        return normalizedSourceLocale === locale ? 'translated' : 'not_translated';
    }

    return 'unverified';
}

export function inferStatusFromLocalizedPair(
    requestedLocale: string,
    englishValue: string | null | undefined,
    frenchValue: string | null | undefined,
): ApiContentTranslationStatus {
    const locale = normalizeApiLocale(requestedLocale);
    const requestedValue = locale === 'fr' ? frenchValue : englishValue;
    const otherValue = locale === 'fr' ? englishValue : frenchValue;

    if (isNonEmptyString(requestedValue)) return 'translated';
    if (isNonEmptyString(otherValue)) return 'not_translated';
    return 'unverified';
}

export function inferStatusFromContentMetadata(
    requestedLocale: string,
    contentLocales: unknown,
    contentSourceLocale?: string | null,
): ApiContentTranslationStatus {
    const locale = normalizeApiLocale(requestedLocale);
    const otherLocale = getOtherLocale(locale);
    const normalizedLocales = normalizeContentLocales(contentLocales);

    if (normalizedLocales.includes(locale)) return 'translated';
    if (normalizedLocales.includes(otherLocale)) return 'not_translated';

    const normalizedSourceLocale = normalizeSourceLocale(contentSourceLocale);
    if (normalizedSourceLocale) {
        return normalizedSourceLocale === locale ? 'translated' : 'not_translated';
    }

    return 'unverified';
}

export function mergeApiContentTranslationStatuses(
    ...statuses: ApiContentTranslationStatus[]
): ApiContentTranslationStatus {
    if (statuses.length === 0) return 'translated';

    return statuses.reduce<ApiContentTranslationStatus>((current, next) => {
        return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
    }, 'translated');
}

export function getApiContentStatusLabel(
    status: ApiContentTranslationStatus,
    locale: string,
): string | null {
    if (status === 'translated') return null;

    const normalizedLocale = normalizeApiLocale(locale);
    return normalizedLocale === 'fr' ? 'pas de traduction' : 'No translation';
}
