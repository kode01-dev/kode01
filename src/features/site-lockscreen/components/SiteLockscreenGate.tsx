'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { SiteLockscreenOverlay } from './SiteLockscreenOverlay';
import { GateSkeleton } from './GateSkeleton';
import type { LockscreenConfig } from '../types';
import { normalizeLockscreenConfig } from '../lib/lockscreen-config';

interface SiteLockscreenGateProps {
  children: React.ReactNode;
  initialState?: {
    locked: boolean;
    config: LockscreenConfig | null;
  };
}

export function SiteLockscreenGate({ children, initialState }: SiteLockscreenGateProps) {
  const locale = useLocale();
  const hasInitialState = typeof initialState !== 'undefined';
  const [locked, setLocked] = useState(initialState?.locked ?? false);
  const [config, setConfig] = useState<LockscreenConfig | null>(initialState?.config ?? null);
  const [loading, setLoading] = useState(!hasInitialState);

  useEffect(() => {
    if (hasInitialState) return;

    async function checkLockscreen() {
      try {
        // Check if lockscreen is active and user is unlocked
        const statusRes = await fetch('/api/lockscreen/status', { cache: 'no-store' });
        if (!statusRes.ok) {
          return;
        }

        const statusData = await statusRes.json();

        if (statusData?.locked === true) {
          // Fetch lockscreen configuration
          const configRes = await fetch('/api/lockscreen/config', { cache: 'no-store' });
          if (!configRes.ok) {
            return;
          }

          const configData = await configRes.json();
          if (!configData?.config || typeof configData.config !== 'object') {
            return;
          }

          setConfig(normalizeLockscreenConfig(configData.config));
          setLocked(true);
        }
      } catch (error) {
        console.error('Error checking lockscreen status:', error);
        // On error, assume unlocked for safety
      } finally {
        setLoading(false);
      }
    }

    void checkLockscreen();
  }, [hasInitialState]);

  // Show premium skeleton while checking status
  if (loading) {
    return <GateSkeleton />;
  }

  // Show lockscreen if locked
  if (locked && config) {
    return <SiteLockscreenOverlay config={config} locale={locale} />;
  }

  // Show normal app content
  return <>{children}</>;
}
