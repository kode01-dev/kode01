import { parseNonNegativeInteger } from './helpers';

type HomeStatsPayload = {
    productsAndArticles: number;
    creators: number;
    totalSales: number;
};

type NewsletterStatsPayload = {
    subscribers: number;
};

type CacheEntry<T> = {
    expiresAt: number;
    value: T;
};

const HOME_STATS_TTL_MS = 15 * 60 * 1000;
const NEWSLETTER_STATS_TTL_MS = 30 * 60 * 1000;

let homeStatsCache: CacheEntry<HomeStatsPayload> | null = null;
let homeStatsInFlight: Promise<HomeStatsPayload> | null = null;

let newsletterStatsCache: CacheEntry<NewsletterStatsPayload> | null = null;
let newsletterStatsInFlight: Promise<NewsletterStatsPayload> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeHomeStats(payload: unknown): HomeStatsPayload {
    if (!isRecord(payload)) {
        return {
            productsAndArticles: 0,
            creators: 0,
            totalSales: 0,
        };
    }

    return {
        productsAndArticles: parseNonNegativeInteger(payload.productsAndArticles),
        creators: parseNonNegativeInteger(payload.creators),
        totalSales: parseNonNegativeInteger(payload.totalSales),
    };
}

function normalizeNewsletterStats(payload: unknown): NewsletterStatsPayload {
    if (!isRecord(payload)) {
        return { subscribers: 0 };
    }

    return { subscribers: parseNonNegativeInteger(payload.subscribers) };
}

function getFreshCache<T>(cache: CacheEntry<T> | null): T | null {
    if (!cache) return null;
    if (cache.expiresAt <= Date.now()) return null;
    return cache.value;
}

export async function fetchHomeStatsWithCache(): Promise<HomeStatsPayload> {
    const fresh = getFreshCache(homeStatsCache);
    if (fresh) return fresh;
    if (homeStatsInFlight) return homeStatsInFlight;

    homeStatsInFlight = (async () => {
        const response = await fetch('/api/home/stats', { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Failed to fetch home stats (${response.status})`);
        }

        const payload = normalizeHomeStats((await response.json()) as unknown);
        homeStatsCache = {
            value: payload,
            expiresAt: Date.now() + HOME_STATS_TTL_MS,
        };
        return payload;
    })();

    try {
        return await homeStatsInFlight;
    } catch (error) {
        if (homeStatsCache) return homeStatsCache.value;
        throw error;
    } finally {
        homeStatsInFlight = null;
    }
}

export async function fetchNewsletterStatsWithCache(): Promise<NewsletterStatsPayload> {
    const fresh = getFreshCache(newsletterStatsCache);
    if (fresh) return fresh;
    if (newsletterStatsInFlight) return newsletterStatsInFlight;

    newsletterStatsInFlight = (async () => {
        const response = await fetch('/api/newsletter/stats', { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Failed to fetch newsletter stats (${response.status})`);
        }

        const payload = normalizeNewsletterStats((await response.json()) as unknown);
        newsletterStatsCache = {
            value: payload,
            expiresAt: Date.now() + NEWSLETTER_STATS_TTL_MS,
        };
        return payload;
    })();

    try {
        return await newsletterStatsInFlight;
    } catch (error) {
        if (newsletterStatsCache) return newsletterStatsCache.value;
        throw error;
    } finally {
        newsletterStatsInFlight = null;
    }
}
