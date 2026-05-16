export type CookieConsentEventType =
  | 'consent_first_choice'
  | 'consent_updated'
  | 'consent_withdrawn';

export type CookieConsentSource = 'banner' | 'preferences' | 'settings';

export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

export interface CookieConsentEventPayload {
  eventType: CookieConsentEventType;
  acceptedCategories: string[];
  rejectedCategories: string[];
  source: CookieConsentSource;
  consentVersion: string;
  locale?: string;
}

export interface CookieConsentSummaryRangeResponse {
  range: '24h' | '7d' | '30d';
  from: string;
  to: string;
  kpis: {
    totalEvents: number;
    firstChoices: number;
    consentRatePercent: number;
    analyticsAcceptedPercent: number;
    marketingAcceptedPercent: number;
    optOutPercent: number;
  };
  series: Array<{
    bucket: string;
    label: string;
    total: number;
    withdrawals: number;
    optionalAccepted: number;
  }>;
}
