import type { CookieCategory } from '../types';

type CookieConsentPayload = {
  categories?: string[] | Record<string, unknown>;
  acceptedCategories?: string[] | Record<string, unknown>;
};

export const COOKIE_CONSENT_COOKIE_NAME = 'cc_cookie';
export const COOKIE_CONSENT_ID_COOKIE_NAME = 'kode01_consent_id';
export const ANONYMOUS_RECO_PROFILE_COOKIE_NAME = 'kode01_reco_profile';
export const LEGACY_COOKIE_CONSENT_ID_COOKIE_NAME = 'thiki_consent_id';
export const LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME = 'thiki_reco_profile';
export const COOKIE_CONSENT_VERSION = '2026-04-19-compliance-v2';
export const COOKIE_CONSENT_CHANGED_EVENT = 'kode01:cookie-consent-changed';
export const LEGACY_COOKIE_CONSENT_CHANGED_EVENT = 'thiki:cookie-consent-changed';
export const OPTIONAL_COOKIE_CATEGORIES: CookieCategory[] = ['analytics', 'marketing'];
export const MARKETING_STORE_STORAGE_KEY = 'kode01-marketing-store';

const ANALYTICS_LOCAL_STORAGE_PREFIXES = ['view-tracked:', 'reco-view-tracked:'] as const;

function clearBrowserCookieValue(cookieName: string): void {
  if (typeof document === 'undefined') return;
  const encoded = encodeURIComponent(cookieName);
  document.cookie = `${encoded}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function removeLocalStorageByPrefix(prefix: string): void {
  if (typeof window === 'undefined') return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (typeof key !== 'string') continue;
      if (key.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage unavailability in locked-down browser contexts.
  }
}

function removeLocalStorageKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage unavailability in locked-down browser contexts.
  }
}

function safeDecodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractAcceptedCategoriesFromValue(value: CookieConsentPayload['categories']): string[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);
}

export function extractAcceptedCategoriesFromCcCookie(rawCookieValue?: string): string[] {
  if (!rawCookieValue) return [];

  let parsed: CookieConsentPayload | null = null;
  try {
    parsed = JSON.parse(safeDecodeCookieValue(rawCookieValue)) as CookieConsentPayload;
  } catch {
    return [];
  }

  return [
    ...extractAcceptedCategoriesFromValue(parsed?.categories),
    ...extractAcceptedCategoriesFromValue(parsed?.acceptedCategories),
  ];
}

export function extractRejectedCategories(acceptedCategories: string[]): string[] {
  const accepted = new Set(acceptedCategories);
  return OPTIONAL_COOKIE_CATEGORIES.filter((category) => !accepted.has(category));
}

export function hasAnalyticsConsentFromCcCookie(rawCookieValue?: string): boolean {
  return extractAcceptedCategoriesFromCcCookie(rawCookieValue).includes('analytics');
}

export function hasMarketingConsentFromCcCookie(rawCookieValue?: string): boolean {
  return extractAcceptedCategoriesFromCcCookie(rawCookieValue).includes('marketing');
}

export function parseBrowserCookieValue(cookieName: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const encodedName = `${encodeURIComponent(cookieName)}=`;
  const match = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(encodedName));

  if (!match) return undefined;
  return match.slice(encodedName.length);
}

export function getAcceptedCategoriesFromBrowserCookie(): string[] {
  const raw = parseBrowserCookieValue(COOKIE_CONSENT_COOKIE_NAME);
  return Array.from(new Set(extractAcceptedCategoriesFromCcCookie(raw)));
}

export function hasAnalyticsConsentInBrowser(): boolean {
  return getAcceptedCategoriesFromBrowserCookie().includes('analytics');
}

export function hasMarketingConsentInBrowser(): boolean {
  return getAcceptedCategoriesFromBrowserCookie().includes('marketing');
}

export function cleanupOptionalBrowserStorage(acceptedCategories: string[]): void {
  const accepted = new Set(acceptedCategories);

  if (!accepted.has('analytics')) {
    for (const prefix of ANALYTICS_LOCAL_STORAGE_PREFIXES) {
      removeLocalStorageByPrefix(prefix);
    }
    clearBrowserCookieValue(ANONYMOUS_RECO_PROFILE_COOKIE_NAME);
    clearBrowserCookieValue(LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME);
  }

  if (!accepted.has('marketing')) {
    removeLocalStorageKey(MARKETING_STORE_STORAGE_KEY);
  }
}
