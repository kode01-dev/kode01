'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import type { SpotlightHintKey } from '../types';

interface SpotlightHintProps {
  hintKey: SpotlightHintKey;
  children: React.ReactNode;
  className?: string;
}

export function SpotlightHint({ hintKey, children, className }: SpotlightHintProps) {
  const { isHintSeen, markHintSeen } = useOnboardingStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = isHintSeen(hintKey);

  const markSeen = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    markHintSeen(hintKey);
  }, [hintKey, markHintSeen]);

  useEffect(() => {
    if (seen) return;

    // Auto-mark as seen after 3 seconds
    timerRef.current = setTimeout(markSeen, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [seen, markSeen]);

  if (seen) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      className={`spotlight-hint ${className ?? ''}`}
      onMouseEnter={markSeen}
      onFocus={markSeen}
    >
      {children}
    </span>
  );
}
