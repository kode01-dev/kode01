'use client';

import { useEffect } from 'react';
import { getAcceptedCategoriesFromBrowserCookie } from '@/features/cookies/lib/consent';

/**
 * Tracks a blog article view on mount.
 * Requires analytics consent before sending the beacon.
 * Uses sendBeacon for reliability during navigation.
 */
export function EditorialViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    const accepted = getAcceptedCategoriesFromBrowserCookie();
    if (!accepted.includes('analytics')) return;

    const payload = JSON.stringify({ postId, event: 'view' });

    // Prefer sendBeacon (non-blocking, survives navigation)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/editorial/track',
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      fetch('/api/editorial/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [postId]);

  return null;
}
