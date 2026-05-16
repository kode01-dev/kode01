export type CampaignNewsFormat = 'split' | 'full';
export type CampaignDestinationKind = 'internal' | 'external';
export type PlacementSlug = 'news' | 'newsletter_footer';
export type LauncherStep = 'offers' | 'details';

export type PricingPlanOption = {
  id: string;
  code: string;
  name: string;
  durationDays: number;
  basePrice: number;
  currency: string;
};

export type PlacementMultipliers = {
  news: number;
  newsletterFooter: number;
};

export type PlacementAssetState = {
  file: File | null;
  uploadedUrl: string | null;
  width: number | null;
  height: number | null;
};
