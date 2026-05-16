'use client';

import { getAcceptedCategoriesFromBrowserCookie } from '@/features/cookies/lib/consent';

/**
 * Tracks a blog article click.
 * Requires analytics consent before sending the beacon.
 */
export function EditorialClickTracker({
  postId,
  children,
  className,
}: {
  postId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const handleClick = () => {
    const accepted = getAcceptedCategoriesFromBrowserCookie();
    if (!accepted.includes('analytics')) return;

    const payload = JSON.stringify({ postId, event: 'click' });

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
  };

  return (
    <span onClick={handleClick} className={className}>
      {children}
    </span>
  );
}
