'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  hasMarketingConsentInBrowser,
} from '@/features/cookies/lib/consent';
import {
  OPEN_ZIPCHAT_SUPPORT_EVENT,
  ZIPCHAT_SCRIPT_ID,
  ZIPCHAT_SCRIPT_SRC,
  cleanupZipchatRuntime,
  getZipchatApi,
  isZipchatWidgetReady,
  tryOpenZipchat,
} from './zipchat-client';

type ZipchatMode = 'support' | 'marketing';
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const READY_RETRY_INTERVAL_MS = 250;
const READY_RETRY_TIMEOUT_MS = 6000;

function waitForZipchatReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isZipchatWidgetReady()) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (isZipchatWidgetReady()) {
        window.clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= READY_RETRY_TIMEOUT_MS) {
        window.clearInterval(intervalId);
        reject(new Error('Zipchat did not become ready in time'));
      }
    }, READY_RETRY_INTERVAL_MS);
  });
}

function appendZipchatScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(ZIPCHAT_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      void waitForZipchatReady().then(resolve, reject);
      return;
    }

    const script = document.createElement('script');
    script.id = ZIPCHAT_SCRIPT_ID;
    script.src = ZIPCHAT_SCRIPT_SRC;
    script.async = true;
    script.dataset.noOptimize = '1';
    script.onload = () => {
      void waitForZipchatReady().then(resolve, reject);
    };
    script.onerror = () => reject(new Error('Zipchat script failed to load'));
    document.body.appendChild(script);
  });
}

export function ZipchatController() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const activeModeRef = useRef<ZipchatMode | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const lastIdentifiedUserIdRef = useRef<string | null>(null);

  const identifyCurrentUser = useCallback(async () => {
    if (loading || !userId || lastIdentifiedUserIdRef.current === userId) {
      return;
    }

    try {
      const response = await fetch('/api/zipchat/identify', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) return;

      const payload: unknown = await response.json();
      const token =
        typeof payload === 'object' &&
        payload !== null &&
        'token' in payload &&
        typeof payload.token === 'string'
          ? payload.token
          : null;

      if (!token) return;

      const zipchat = getZipchatApi();
      if (zipchat?.identify) {
        zipchat.identify(token);
        lastIdentifiedUserIdRef.current = userId;
      }
    } catch (error) {
      console.error('Zipchat identify failed:', error);
    }
  }, [loading, userId]);

  const loadZipchat = useCallback(
    async (mode: ZipchatMode, openAfterLoad: boolean) => {
      activeModeRef.current = mode;
      setLoadState((current) => (current === 'loaded' ? current : 'loading'));

      if (!loadPromiseRef.current) {
        loadPromiseRef.current = appendZipchatScript();
      }

      try {
        await loadPromiseRef.current;
        setLoadState('loaded');
        await identifyCurrentUser();

        if (openAfterLoad) {
          tryOpenZipchat();
        }
      } catch (error) {
        console.error('Zipchat load failed:', error);
        loadPromiseRef.current = null;
        activeModeRef.current = null;
        setLoadState('error');
      }
    },
    [identifyCurrentUser],
  );

  useEffect(() => {
    if (loadState === 'loaded') {
      void identifyCurrentUser();
    }
  }, [identifyCurrentUser, loadState]);

  useEffect(() => {
    const syncFromConsent = () => {
      const nextMode: ZipchatMode = hasMarketingConsentInBrowser() ? 'marketing' : 'support';

      if (activeModeRef.current === 'marketing' && nextMode === 'support') {
        cleanupZipchatRuntime();
        loadPromiseRef.current = null;
        activeModeRef.current = null;
        setLoadState('idle');
      }

      void loadZipchat(nextMode, false);
    };

    syncFromConsent();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncFromConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncFromConsent);
  }, [loadZipchat]);

  useEffect(() => {
    const handleSupportRequest = () => {
      if (loadState === 'loaded') {
        tryOpenZipchat();
        return;
      }

      void loadZipchat(hasMarketingConsentInBrowser() ? 'marketing' : 'support', true);
    };

    window.addEventListener(OPEN_ZIPCHAT_SUPPORT_EVENT, handleSupportRequest);
    return () => window.removeEventListener(OPEN_ZIPCHAT_SUPPORT_EVENT, handleSupportRequest);
  }, [loadState, loadZipchat]);

  return null;
}
