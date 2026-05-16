'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  hasMarketingConsentInBrowser,
  COOKIE_CONSENT_CHANGED_EVENT,
} from '@/features/cookies/lib/consent';
import { clearMarketingStorePersistence, initializeMarketingStore } from '../store/useMarketingStore';
import { MarketingPopup } from './MarketingPopup';
import { MarketingBanner } from './MarketingBanner';
import type { ActiveCampaignDisplay } from '../types';

type MarketingDevice = 'desktop' | 'mobile' | 'tablet';
type ActiveCampaignsResponse = {
  campaigns?: ActiveCampaignDisplay[];
};

type CampaignCacheEntry = {
  campaigns: ActiveCampaignDisplay[];
  expiresAt: number;
};

const CAMPAIGN_CACHE_TTL_MS = 60_000;
const DEFAULT_429_COOLDOWN_MS = 60_000;
const campaignCache = new Map<string, CampaignCacheEntry>();
const requestCooldownByKey = new Map<string, number>();
const inFlightCampaignRequests = new Map<string, Promise<ActiveCampaignDisplay[]>>();

function getInitialMarketingConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return hasMarketingConsentInBrowser();
}

function getDeviceType(): MarketingDevice {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function normalizeMarketingPath(pathname: string): string {
  // /en/market -> /market, /fr/market -> /market
  if (!pathname.startsWith('/en/') && !pathname.startsWith('/fr/')) {
    return pathname;
  }

  const normalizedPath = `/${pathname.split('/').slice(2).join('/')}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  return normalizedPath || '/';
}

function splitCampaigns(campaigns: ActiveCampaignDisplay[]) {
  const popups = campaigns.filter(
    (campaign) =>
      campaign.template_type.startsWith('popup_') ||
      campaign.template_type === 'newsletter_form' ||
      campaign.template_type === 'announcement' ||
      campaign.template_type === 'promotional'
  );

  const banners = campaigns.filter((campaign) =>
    campaign.template_type.startsWith('banner_')
  );

  return { popups, banners };
}

function getRetryAfterMs(retryAfterHeader: string | null): number {
  if (!retryAfterHeader) return DEFAULT_429_COOLDOWN_MS;

  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const absoluteTimestamp = Date.parse(retryAfterHeader);
  if (Number.isFinite(absoluteTimestamp)) {
    const deltaMs = absoluteTimestamp - Date.now();
    if (deltaMs > 0) return deltaMs;
  }

  return DEFAULT_429_COOLDOWN_MS;
}

async function loadActiveCampaigns(queryString: string): Promise<ActiveCampaignDisplay[]> {
  const existingRequest = inFlightCampaignRequests.get(queryString);
  if (existingRequest) return existingRequest;

  const requestPromise = (async () => {
    const response = await fetch(`/api/marketing/active?${queryString}`);

    if (response.status === 429) {
      const cooldownMs = getRetryAfterMs(response.headers.get('retry-after'));
      requestCooldownByKey.set(queryString, Date.now() + cooldownMs);
      return campaignCache.get(queryString)?.campaigns ?? [];
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch marketing campaigns (${response.status}: ${response.statusText})`
      );
    }

    const data = (await response.json()) as ActiveCampaignsResponse;
    const nextCampaigns = Array.isArray(data.campaigns) ? data.campaigns : [];

    campaignCache.set(queryString, {
      campaigns: nextCampaigns,
      expiresAt: Date.now() + CAMPAIGN_CACHE_TTL_MS,
    });
    requestCooldownByKey.delete(queryString);

    return nextCampaigns;
  })();

  inFlightCampaignRequests.set(queryString, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightCampaignRequests.delete(queryString);
  }
}

function useMarketingProviderState(pathname: string, locale: string) {
  const [campaigns, setCampaigns] = useState<ActiveCampaignDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasConsent, setHasConsent] = useState(getInitialMarketingConsent);

  useEffect(() => {
    if (!hasConsent) return;
    initializeMarketingStore();
  }, [hasConsent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleConsentChange = () => {
      const newConsent = hasMarketingConsentInBrowser();
      setHasConsent(newConsent);

      if (!newConsent) {
        clearMarketingStorePersistence();
        setCampaigns([]);
        setLoading(false);
        return;
      }
    };

    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleConsentChange);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, handleConsentChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchActiveCampaigns = async () => {
      if (!hasConsent) {
        if (!cancelled) {
          setCampaigns((current) => (current.length === 0 ? current : []));
          setLoading(false);
        }
        return;
      }

      const queryString = new URLSearchParams({
        page: normalizeMarketingPath(pathname),
        locale,
        device: getDeviceType(),
      }).toString();
      const now = Date.now();
      const cachedEntry = campaignCache.get(queryString);
      const hasFreshCache = !!cachedEntry && cachedEntry.expiresAt > now;
      const cooldownUntil = requestCooldownByKey.get(queryString) ?? 0;

      if (hasFreshCache && !cancelled) {
        setCampaigns(cachedEntry.campaigns);
        setLoading(false);
        return;
      }

      if (cooldownUntil > now) {
        if (!cancelled) {
          setCampaigns(cachedEntry?.campaigns ?? []);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        const nextCampaigns = await loadActiveCampaigns(queryString);
        if (!cancelled) {
          setCampaigns(nextCampaigns);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching marketing campaigns:', error);
          setCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchActiveCampaigns();
    return () => {
      cancelled = true;
    };
  }, [hasConsent, locale, pathname]);

  return { campaigns, loading, hasConsent };
}

function MarketingCampaignDisplays({
  campaigns,
}: {
  campaigns: ActiveCampaignDisplay[];
}) {
  const { popups, banners } = splitCampaigns(campaigns);

  return (
    <>
      {popups.map((campaign) => (
        <MarketingPopup key={campaign.campaign_id} campaign={campaign} />
      ))}
      {banners.map((campaign) => (
        <MarketingBanner key={campaign.campaign_id} campaign={campaign} />
      ))}
    </>
  );
}

/**
 * Global provider component for displaying marketing campaigns
 * Handles:
 * - Marketing consent verification
 * - Active campaigns fetching based on context
 * - Rendering popups and banners
 * - Listening to consent changes
 */
export function MarketingProvider() {
  const pathname = usePathname() ?? '/';
  const locale = useLocale();
  const { campaigns, loading, hasConsent } = useMarketingProviderState(
    pathname,
    locale
  );

  if (!hasConsent || loading || campaigns.length === 0) {
    return null;
  }

  return <MarketingCampaignDisplays campaigns={campaigns} />;
}
