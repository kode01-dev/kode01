import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hasMarketingConsentInBrowser, MARKETING_STORE_STORAGE_KEY } from '@/features/cookies/lib/consent';
import type { MarketingEventType, DismissedCampaign, MarketingStoreState } from '../types';

/**
 * Zustand store for marketing state management
 * Handles dismissed campaigns, cooldowns, and event tracking
 * Persisted to localStorage
 */
export const useMarketingStore = create<MarketingStoreState>()(
  persist(
    (set, get) => ({
      dismissedCampaigns: [],
      fingerprint: '', // Initialize empty, will be set on first use

      /**
       * Check if a campaign is dismissed and cooldown hasn't expired
       */
      isDismissed: (campaignId: string): boolean => {
        const { dismissedCampaigns } = get();
        const dismissed = dismissedCampaigns.find((d) => d.id === campaignId);

        if (!dismissed) return false;

        // Check if cooldown expired
        const elapsed = Date.now() - dismissed.dismissedAt;
        const cooldown = dismissed.cooldownHours * 60 * 60 * 1000;

        if (elapsed >= cooldown) {
          // Cooldown expired, remove from list
          set((state) => ({
            dismissedCampaigns: state.dismissedCampaigns.filter(
              (d) => d.id !== campaignId
            ),
          }));
          return false;
        }

        return true;
      },

      /**
       * Mark a campaign as dismissed with cooldown
       */
      dismissCampaign: (campaignId: string, cooldownHours: number): void => {
        set((state) => ({
          dismissedCampaigns: [
            ...state.dismissedCampaigns.filter((d) => d.id !== campaignId),
            {
              id: campaignId,
              dismissedAt: Date.now(),
              cooldownHours,
            } as DismissedCampaign,
          ],
        }));
      },

      /**
       * Track a marketing event
       * Respects user consent before sending
       */
      trackEvent: async (
        campaignId: string,
        eventType: MarketingEventType
      ): Promise<void> => {
        try {
          // Check marketing consent
          if (!hasMarketingConsentInBrowser()) {
            console.debug('Marketing consent not given, skipping event tracking');
            return;
          }

          const { fingerprint } = get();

          const response = await fetch('/api/marketing/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaign_id: campaignId,
              event_type: eventType,
              locale: document.documentElement.lang || 'en',
              page_url: window.location.href,
              device_type: getDeviceType(),
              fingerprint: fingerprint || undefined,
            }),
          });

          if (!response.ok) {
            console.error('Failed to track marketing event:', response.statusText);
          }
        } catch (error) {
          console.error('Error tracking marketing event:', error);
        }
      },

      /**
       * Set fingerprint for deduplication
       */
      setFingerprint: (fingerprint: string): void => {
        set({ fingerprint });
      },
    }),
    {
      name: MARKETING_STORE_STORAGE_KEY,
      version: 1,
    }
  )
);

/**
 * Helper function to determine device type
 */
function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;

  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Generate a simple device fingerprint for deduplication
 * Uses a combination of user agent, screen size, and timezone
 */
export function generateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';

  const userAgent = navigator.userAgent;
  const screenSize = `${window.screen.width}x${window.screen.height}`;
  const timezone = new Date().getTimezoneOffset();

  // Create simple hash
  const str = `${userAgent}|${screenSize}|${timezone}`;
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * Initialize fingerprint in store on first use
 */
export function initializeMarketingStore(): void {
  if (typeof window === 'undefined') return;
  if (!hasMarketingConsentInBrowser()) return;

  const store = useMarketingStore.getState();

  if (!store.fingerprint) {
    const fingerprint = generateDeviceFingerprint();
    store.setFingerprint(fingerprint);
  }
}

export function clearMarketingStorePersistence(): void {
  useMarketingStore.setState({
    dismissedCampaigns: [],
    fingerprint: '',
  });

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(MARKETING_STORE_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability in locked-down browser contexts.
  }
}
