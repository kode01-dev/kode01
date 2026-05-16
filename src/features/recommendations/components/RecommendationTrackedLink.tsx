'use client';

import Link, { LinkProps } from 'next/link';
import { ReactNode } from 'react';
import { RecommendationEventPayload } from '../types';

interface RecommendationTrackedLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  className?: string;
  children: ReactNode;
  payload: RecommendationEventPayload;
}

function fireRecommendationClick(payload: RecommendationEventPayload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/recommendations/event', blob);
    return;
  }

  void fetch('/api/recommendations/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Tracking should never block navigation.
  });
}

export function RecommendationTrackedLink({
  href,
  className,
  children,
  payload,
  ...props
}: RecommendationTrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => fireRecommendationClick(payload)}
      {...props}
    >
      {children}
    </Link>
  );
}

