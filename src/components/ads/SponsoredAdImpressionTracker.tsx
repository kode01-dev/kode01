'use client';

import { useEffect } from 'react';
import { AdPlacementSlug } from '@/features/ads/types';

type SponsoredAdImpressionTrackerProps = {
  campaignId: string;
  creativeId: string;
  placement: AdPlacementSlug;
  locale?: string;
  pagePath?: string;
};

export function SponsoredAdImpressionTracker({
  campaignId,
  creativeId,
  placement,
  locale,
  pagePath,
}: SponsoredAdImpressionTrackerProps) {
  useEffect(() => {
    const fingerprint = typeof window !== 'undefined'
      ? `${window.location.pathname}:${campaignId}:${creativeId}:${Date.now()}`
      : undefined;

    void fetch('/api/ads/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        creativeId,
        placement,
        eventType: 'impression',
        channel: 'web',
        locale,
        pagePath,
        fingerprint,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [campaignId, creativeId, locale, pagePath, placement]);

  return null;
}
