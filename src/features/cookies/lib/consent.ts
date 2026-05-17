import type { CookieCategory } from '../types';

type GoogleConsentValue = 'granted' | 'denied';
type GoogleAnalyticsDisableKey = `ga-disable-${string}`;

export type GoogleConsentModeState = {
  analytics_storage: GoogleConsentValue;
  ad_storage: GoogleConsentValue;
  ad_user_data: GoogleConsentValue;
  ad_personalization: GoogleConsentValue;
  security_storage: 'granted';
};

type CookieConsentPayload = {
  categories?: string[] | Record<string, unknown>;
  acceptedCategories?: string[] | Record<string, unknown>;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: GoogleAnalyticsDisableKey]: boolean | undefined;
  }
}

export const COOKIE_CONSENT_COOKIE_NAME = 'cc_cookie';
export const COOKIE_CONSENT_ID_COOKIE_NAME = 'kode01_consent_id';
export const ANONYMOUS_RECO_PROFILE_COOKIE_NAME = 'kode01_reco_profile';
export const LEGACY_COOKIE_CONSENT_ID_COOKIE_NAME = 'thiki_consent_id';
export const LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME = 'thiki_reco_profile';
export const COOKIE_CONSENT_VERSION = '2026-05-17-zipchat-native-bubble-v1';
export const COOKIE_CONSENT_CHANGED_EVENT = 'kode01:cookie-consent-changed';
export const LEGACY_COOKIE_CONSENT_CHANGED_EVENT = 'thiki:cookie-consent-changed';
export const OPTIONAL_COOKIE_CATEGORIES: CookieCategory[] = ['analytics', 'marketing'];
export const MARKETING_STORE_STORAGE_KEY = 'kode01-marketing-store';

const ANALYTICS_LOCAL_STORAGE_PREFIXES = ['view-tracked:', 'reco-view-tracked:'] as const;
const GOOGLE_ANALYTICS_COOKIE_NAMES = new Set(['_ga', '_gid', '_gat']);
const GOOGLE_ANALYTICS_COOKIE_PREFIXES = ['_ga_', '_gat_', '_gac_'] as const;
const GOOGLE_AD_COOKIE_PREFIXES = ['_gcl_'] as const;
const ZIPCHAT_COOKIE_PREFIXES = ['zipchat', 'zc_', 'zip_'] as const;

function getCookieDeletionDomains(): Array<string | null> {
  if (typeof window === 'undefined') return [null];

  const hostname = window.location.hostname;
  if (!hostname || hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return [null];
  }

  const parts = hostname.split('.').filter(Boolean);
  const domains = new Set<string | null>([null, hostname, `.${hostname}`]);

  for (let index = 1; index < parts.length - 1; index += 1) {
    domains.add(`.${parts.slice(index).join('.')}`);
  }

  return Array.from(domains);
}

function clearBrowserCookieValue(cookieName: string): void {
  if (typeof document === 'undefined') return;
  const encoded = encodeURIComponent(cookieName);

  for (const domain of getCookieDeletionDomains()) {
    const domainPart = domain ? `; Domain=${domain}` : '';
    document.cookie = `${encoded}=; Max-Age=0; Path=/${domainPart}; SameSite=Lax`;
  }
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

function removeBrowserStorageByMatcher(storage: Storage, matcher: (key: string) => boolean): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (typeof key !== 'string') continue;
    if (matcher(key)) {
      storage.removeItem(key);
    }
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

function getBrowserCookieNames(): string[] {
  if (typeof document === 'undefined') return [];

  return document.cookie
    .split(';')
    .map((chunk) => chunk.trim().split('=')[0])
    .filter(Boolean)
    .map((name) => {
      try {
        return decodeURIComponent(name);
      } catch {
        return name;
      }
    });
}

function matchesCookiePrefix(cookieName: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => cookieName.startsWith(prefix));
}

function getGoogleAnalyticsDisabledKey(measurementId: string): GoogleAnalyticsDisableKey {
  return `ga-disable-${measurementId}`;
}

export function hasGlobalPrivacyControlInBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function getGoogleAnalyticsMeasurementId(): string | null {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  return measurementId || null;
}

export function buildGoogleConsentModeState(acceptedCategories: string[]): GoogleConsentModeState {
  const accepted = new Set(acceptedCategories);
  const analyticsGranted = accepted.has('analytics') ? 'granted' : 'denied';
  const marketingGranted = accepted.has('marketing') && !hasGlobalPrivacyControlInBrowser() ? 'granted' : 'denied';

  return {
    analytics_storage: analyticsGranted,
    ad_storage: marketingGranted,
    ad_user_data: marketingGranted,
    ad_personalization: marketingGranted,
    security_storage: 'granted',
  };
}

export function ensureGoogleTagQueue(): void {
  if (typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
}

export function setGoogleAnalyticsCollectionDisabled(disabled: boolean, measurementId = getGoogleAnalyticsMeasurementId()): void {
  if (typeof window === 'undefined' || !measurementId) return;
  window[getGoogleAnalyticsDisabledKey(measurementId)] = disabled;
}

export function clearGoogleAnalyticsBrowserCookies(): void {
  for (const cookieName of getBrowserCookieNames()) {
    if (
      GOOGLE_ANALYTICS_COOKIE_NAMES.has(cookieName) ||
      matchesCookiePrefix(cookieName, GOOGLE_ANALYTICS_COOKIE_PREFIXES)
    ) {
      clearBrowserCookieValue(cookieName);
    }
  }
}

export function clearGoogleAdvertisingBrowserCookies(): void {
  for (const cookieName of getBrowserCookieNames()) {
    if (matchesCookiePrefix(cookieName, GOOGLE_AD_COOKIE_PREFIXES)) {
      clearBrowserCookieValue(cookieName);
    }
  }
}

export function syncGoogleConsentModeFromCategories(acceptedCategories: string[]): void {
  if (typeof window === 'undefined') return;

  const state = buildGoogleConsentModeState(acceptedCategories);
  ensureGoogleTagQueue();
  window.gtag?.('consent', 'update', state);
  setGoogleAnalyticsCollectionDisabled(state.analytics_storage !== 'granted');

  if (state.analytics_storage !== 'granted') {
    clearGoogleAnalyticsBrowserCookies();
  }

  if (state.ad_storage !== 'granted') {
    clearGoogleAdvertisingBrowserCookies();
  }
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
  const acceptedCategories = Array.from(new Set(extractAcceptedCategoriesFromCcCookie(raw)));
  if (!hasGlobalPrivacyControlInBrowser()) {
    return acceptedCategories;
  }
  return acceptedCategories.filter((category) => category !== 'marketing');
}

export function hasAnalyticsConsentInBrowser(): boolean {
  return getAcceptedCategoriesFromBrowserCookie().includes('analytics');
}

export function hasMarketingConsentInBrowser(): boolean {
  return !hasGlobalPrivacyControlInBrowser() && getAcceptedCategoriesFromBrowserCookie().includes('marketing');
}

export function cleanupOptionalBrowserStorage(acceptedCategories: string[]): void {
  const effectiveAcceptedCategories = hasGlobalPrivacyControlInBrowser()
    ? acceptedCategories.filter((category) => category !== 'marketing')
    : acceptedCategories;
  const accepted = new Set(effectiveAcceptedCategories);
  syncGoogleConsentModeFromCategories(effectiveAcceptedCategories);

  if (!accepted.has('analytics')) {
    for (const prefix of ANALYTICS_LOCAL_STORAGE_PREFIXES) {
      removeLocalStorageByPrefix(prefix);
    }
    clearBrowserCookieValue(ANONYMOUS_RECO_PROFILE_COOKIE_NAME);
    clearBrowserCookieValue(LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME);
  }

  if (!accepted.has('marketing')) {
    removeLocalStorageKey(MARKETING_STORE_STORAGE_KEY);
    clearZipchatBrowserStorage();
  }
}

export function clearZipchatBrowserStorage(): void {
  if (typeof window === 'undefined') return;

  const isZipchatKey = (key: string) => key.toLowerCase().includes('zipchat');
  try {
    removeBrowserStorageByMatcher(window.localStorage, isZipchatKey);
    removeBrowserStorageByMatcher(window.sessionStorage, isZipchatKey);
  } catch {
    // Ignore storage unavailability in locked-down browser contexts.
  }

  for (const cookieName of getBrowserCookieNames()) {
    const normalizedCookieName = cookieName.toLowerCase();
    if (
      normalizedCookieName.includes('zipchat') ||
      matchesCookiePrefix(normalizedCookieName, ZIPCHAT_COOKIE_PREFIXES)
    ) {
      clearBrowserCookieValue(cookieName);
    }
  }
}
