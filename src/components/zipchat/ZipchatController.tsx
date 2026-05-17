'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  clearZipchatBrowserStorage,
  hasMarketingConsentInBrowser,
} from '@/features/cookies/lib/consent';
import {
  OPEN_ZIPCHAT_SUPPORT_EVENT,
  ZIPCHAT_SCRIPT_ID,
  ZIPCHAT_SCRIPT_SRC,
  cleanupZipchatRuntime,
  getZipchatApi,
  tryOpenZipchat,
} from './zipchat-client';

type ZipchatMode = 'support' | 'marketing';
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const READY_RETRY_INTERVAL_MS = 250;
const READY_RETRY_TIMEOUT_MS = 6000;
const RELOAD_AFTER_MARKETING_WITHDRAWAL_MS = 80;

const copy = {
  fr: {
    button: 'Support',
    loading: 'Ouverture...',
    noticeTitle: 'Ouvrir le support KODE01',
    notice:
      'Nous allons charger Zipchat, notre fournisseur de clavardage, pour repondre a votre demande. Zipchat peut recevoir votre adresse IP, votre navigateur, la page courante et vos messages. Les popups et propositions proactives restent desactivees sans consentement marketing.',
    open: 'Ouvrir le support',
    cancel: 'Annuler',
    close: 'Fermer',
  },
  en: {
    button: 'Support',
    loading: 'Opening...',
    noticeTitle: 'Open KODE01 support',
    notice:
      'We will load Zipchat, our chat provider, to answer your request. Zipchat may receive your IP address, browser, current page, and messages. Proactive popups and sales prompts remain off without marketing consent.',
    open: 'Open support',
    cancel: 'Cancel',
    close: 'Close',
  },
} as const;

function waitForZipchatReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getZipchatApi()) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (getZipchatApi()) {
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
  const locale = useLocale();
  const labels = locale === 'fr' ? copy.fr : copy.en;
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [noticeOpen, setNoticeOpen] = useState(false);
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

  const openManualSupport = useCallback(() => {
    setNoticeOpen(false);
    void loadZipchat('support', true);
  }, [loadZipchat]);

  useEffect(() => {
    if (loadState === 'loaded') {
      void identifyCurrentUser();
    }
  }, [identifyCurrentUser, loadState]);

  useEffect(() => {
    const syncFromConsent = () => {
      if (hasMarketingConsentInBrowser()) {
        void loadZipchat('marketing', false);
        return;
      }

      if (activeModeRef.current === 'marketing') {
        cleanupZipchatRuntime();
        loadPromiseRef.current = null;
        activeModeRef.current = null;
        setLoadState('idle');
        window.setTimeout(() => window.location.reload(), RELOAD_AFTER_MARKETING_WITHDRAWAL_MS);
        return;
      }

      clearZipchatBrowserStorage();
    };

    syncFromConsent();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncFromConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, syncFromConsent);
  }, [loadZipchat]);

  useEffect(() => {
    const handleSupportRequest = () => {
      if (hasMarketingConsentInBrowser()) {
        void loadZipchat('marketing', true);
        return;
      }

      if (loadState === 'loaded') {
        tryOpenZipchat();
        return;
      }

      setNoticeOpen(true);
    };

    window.addEventListener(OPEN_ZIPCHAT_SUPPORT_EVENT, handleSupportRequest);
    return () => window.removeEventListener(OPEN_ZIPCHAT_SUPPORT_EVENT, handleSupportRequest);
  }, [loadState, loadZipchat]);

  const shouldShowNativeButton = loadState !== 'loaded';

  return (
    <>
      {shouldShowNativeButton && (
        <button
          type="button"
          data-kode01-zipchat-control="true"
          onClick={() => {
            if (hasMarketingConsentInBrowser()) {
              void loadZipchat('marketing', true);
            } else {
              setNoticeOpen(true);
            }
          }}
          disabled={loadState === 'loading'}
          className="zipchat-manual-control fixed bottom-5 left-5 z-50 inline-flex h-12 items-center gap-2 rounded-full border border-kode01-noir/10 bg-kode01-noir px-4 text-sm font-bold text-white shadow-lg transition hover:bg-kode01-pink hover:text-kode01-noir disabled:cursor-wait disabled:opacity-70"
          aria-label={labels.button}
        >
          {loadState === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
          <span>{loadState === 'loading' ? labels.loading : labels.button}</span>
        </button>
      )}

      {noticeOpen && (
        <div
          data-kode01-zipchat-control="true"
          className="zipchat-manual-control fixed inset-0 z-[70] flex items-end justify-center bg-kode01-noir/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zipchat-support-notice-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="zipchat-support-notice-title" className="font-serif text-xl font-black text-kode01-noir">
                  {labels.noticeTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-kode01-noir/65">{labels.notice}</p>
              </div>
              <button
                type="button"
                onClick={() => setNoticeOpen(false)}
                className="rounded-full p-1 text-kode01-noir/50 transition hover:bg-black/5 hover:text-kode01-noir"
                aria-label={labels.close}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setNoticeOpen(false)}
                className="rounded-full border border-kode01-noir/15 px-5 py-2.5 text-sm font-bold text-kode01-noir transition hover:border-kode01-noir"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={openManualSupport}
                className="rounded-full bg-kode01-noir px-5 py-2.5 text-sm font-bold text-white transition hover:bg-kode01-pink hover:text-kode01-noir"
              >
                {labels.open}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
