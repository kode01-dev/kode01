'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClapContentType, ClapResponse, ClapStatsResponse } from '../types';

export function useClap(contentType: ClapContentType, contentId: string, initialTotalClaps: number) {
  const [totalClaps, setTotalClaps] = useState(initialTotalClaps);
  const [hasClapped, setHasClapped] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);

  // Fetch user's existing clap state on mount
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/claps/${contentType}/${contentId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ClapStatsResponse | null) => {
        if (cancelled || !data) return;
        setTotalClaps(data.totalClaps);
        setHasClapped(data.userClaps >= 1);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [contentType, contentId]);

  const handleClap = useCallback(() => {
    // Already clapped or request in flight → ignore
    if (hasClapped || sendingRef.current) return;

    sendingRef.current = true;

    // Optimistic update
    setHasClapped(true);
    setTotalClaps((prev) => prev + 1);

    // Trigger animation
    setIsAnimating(true);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setIsAnimating(false), 300);

    // Send immediately (no debounce needed for single clap)
    fetch('/api/claps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType, content_id: contentId, count: 1 }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ClapResponse | null) => {
        if (!data) {
          // Rollback on failure
          setHasClapped(false);
          setTotalClaps((prev) => Math.max(0, prev - 1));
          return;
        }
        // Reconcile with server
        setHasClapped(data.userClaps >= 1);
        setTotalClaps(data.totalClaps);
      })
      .catch(() => {
        setHasClapped(false);
        setTotalClaps((prev) => Math.max(0, prev - 1));
      })
      .finally(() => {
        sendingRef.current = false;
      });
  }, [hasClapped, contentType, contentId]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, []);

  return { totalClaps, hasClapped, canClap: !hasClapped, isAnimating, loaded, handleClap };
}
