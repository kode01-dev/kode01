import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OnboardingStoreState, SpotlightHintKey } from '../types';

const ONBOARDING_STORE_STORAGE_KEY = 'kode01-onboarding-store';

export const useOnboardingStore = create<OnboardingStoreState>()(
  persist(
    (set, get) => ({
      seenHints: {},
      checklistDismissed: false,
      checklistDismissedAt: null,

      markHintSeen: (key: SpotlightHintKey): void => {
        set((state) => ({
          seenHints: { ...state.seenHints, [key]: true },
        }));
      },

      isHintSeen: (key: SpotlightHintKey): boolean => {
        return get().seenHints[key] === true;
      },

      dismissChecklist: (): void => {
        set({
          checklistDismissed: true,
          checklistDismissedAt: Date.now(),
        });
      },

      resetChecklist: (): void => {
        set({
          checklistDismissed: false,
          checklistDismissedAt: null,
        });
      },
    }),
    {
      name: ONBOARDING_STORE_STORAGE_KEY,
      version: 1,
    }
  )
);

export function clearOnboardingStorePersistence(): void {
  useOnboardingStore.setState({
    seenHints: {},
    checklistDismissed: false,
    checklistDismissedAt: null,
  });

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(ONBOARDING_STORE_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability in locked-down browser contexts.
  }
}
