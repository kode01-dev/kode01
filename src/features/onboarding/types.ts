export type SpotlightHintKey =
  | 'vendor_products'
  | 'vendor_analytics';

export interface OnboardingStoreState {
  seenHints: Partial<Record<SpotlightHintKey, boolean>>;
  checklistDismissed: boolean;
  checklistDismissedAt: number | null;

  markHintSeen: (key: SpotlightHintKey) => void;
  isHintSeen: (key: SpotlightHintKey) => boolean;
  dismissChecklist: () => void;
  resetChecklist: () => void;
}
