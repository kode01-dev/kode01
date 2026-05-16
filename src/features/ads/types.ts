export type AdPlacementSlug = 'free' | 'news' | 'newsletter_footer';
export type AdChannel = 'web' | 'email';
export type AdAdvertiserType = 'user' | 'company' | 'admin';

export type AdCampaignStatus =
  | 'draft'
  | 'pending_payment'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'paused'
  | 'completed';

export type AdEventType = 'impression' | 'click' | 'email_delivered' | 'email_ad_click';

export type SponsoredCreative = {
  campaignId: string;
  creativeId: string;
  title: string;
  ctaText: string;
  imageUrl: string;
  destinationUrl: string;
  destinationKind: 'internal' | 'external';
};
