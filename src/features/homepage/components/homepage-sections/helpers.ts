import type { HomepageSectionContent } from '@/features/homepage-layout/types';

export function getLocalizedSectionValue(
    content: HomepageSectionContent | undefined,
    field: 'title' | 'subtitle' | 'cta_label',
    locale: string,
): string | null {
    if (!content) return null;
    const preferred = locale.startsWith('fr') ? `${field}_fr` : `${field}_en`;
    const preferredValue = content[preferred as keyof HomepageSectionContent];
    if (typeof preferredValue === 'string' && preferredValue.trim()) return preferredValue.trim();
    return null;
}

export function parseNonNegativeInteger(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.floor(parsed));
        }
    }

    return 0;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim().length > 0) {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export function roundStatic(value: number, locale: string): string {
    const rounded = Math.floor(value / 15) * 15;
    const finalValue = (value > 0 && rounded === 0) ? 15 : rounded;
    return finalValue.toLocaleString(locale);
}