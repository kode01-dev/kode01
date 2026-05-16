import type { ApiContentTranslationStatus } from '@/lib/i18n/api-content-status';
import type { Json } from '@/types/database.types';

// ============================================
// ENUMS & STRING LITERALS
// ============================================

export type MarketingTemplateType =
  | 'popup_center'
  | 'popup_corner_br'
  | 'popup_corner_bl'
  | 'banner_top'
  | 'banner_inline'
  | 'banner_floating'
  | 'newsletter_form'
  | 'announcement'
  | 'promotional';

export type MarketingTriggerType =
  | 'page_load'
  | 'scroll_depth'
  | 'time_delay'
  | 'exit_intent'
  | 'manual';

export type MarketingCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type MarketingEventType =
  | 'view'
  | 'click'
  | 'close'
  | 'conversion'
  | 'form_submit';

// ============================================
// TEMPLATES
// ============================================

export interface FieldDefinition {
  type: string;
  size?: string;
  font?: string;
  weight?: string;
  required?: boolean;
  [key: string]: unknown;
}

export interface LayoutComponent {
  type: string;
  position?: string;
  maxWidth?: string;
  padding?: string;
  borderRadius?: string;
  fields?: FieldDefinition[];
  [key: string]: unknown;
}

export interface LayoutSchema {
  components: LayoutComponent[];
}

export interface TemplateConfig {
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
  };
  typography: {
    titleFont: 'serif' | 'sans';
    bodyFont: 'serif' | 'sans';
  };
  spacing: {
    padding: string;
    gap: string;
  };
  animation: {
    entrance: string;
    duration: string;
  };
}

export interface MarketingTemplate {
  id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en?: string | null;
  description_fr?: string | null;
  template_type: MarketingTemplateType;
  preview_image_url?: string | null;
  default_config: Json;
  layout_schema: Json;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// CAMPAIGNS
// ============================================

export interface TargetingRules {
  pages: string[];
  excludePages: string[];
  userRoles: string[];
  locales: string[];
  deviceTypes: ('desktop' | 'mobile' | 'tablet')[];
}

export interface TriggerConfig {
  delay?: number; // milliseconds
  scrollDepth?: number; // percentage
  showOnce?: boolean;
  cooldownHours?: number;
}

export interface MarketingCampaign {
  id: string;
  template_id?: string | null;
  template?: MarketingTemplate | null;

  name: string;
  status: MarketingCampaignStatus;

  // Bilingual content
  title_en: string;
  title_fr: string;
  body_en?: string | null;
  body_fr?: string | null;
  cta_text_en?: string | null;
  cta_text_fr?: string | null;
  cta_url?: string | null;

  // Content metadata
  content_locales: string[];
  content_source_locale?: string | null;

  // Media
  image_url?: string | null;
  background_image_url?: string | null;

  // Styling
  custom_config?: Json | null;

  // Scheduling
  start_at?: string | null;
  end_at?: string | null;

  // Targeting
  targeting_rules: TargetingRules;

  // Display
  trigger_type: MarketingTriggerType;
  trigger_config: TriggerConfig;
  priority: number;

  // Analytics
  view_count: number;
  click_count: number;
  conversion_count: number;

  // Ownership
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaignWithStatus extends MarketingCampaign {
  title_translation_status?: ApiContentTranslationStatus;
  body_translation_status?: ApiContentTranslationStatus;
  cta_translation_status?: ApiContentTranslationStatus;
}

// ============================================
// FRONTEND DISPLAY
// ============================================

export interface ActiveCampaignDisplay {
  campaign_id: string;
  template_type: MarketingTemplateType;
  title: string;
  body?: string;
  cta_text?: string;
  cta_url?: string | null;
  image_url?: string | null;
  custom_config?: Partial<TemplateConfig>;
  trigger_type: MarketingTriggerType;
  trigger_config: TriggerConfig;
  priority: number;
}

// ============================================
// EVENTS & ANALYTICS
// ============================================

export interface MarketingEvent {
  id: string;
  campaign_id: string;
  event_type: MarketingEventType;
  user_id?: string | null;
  session_id?: string | null;
  fingerprint?: string;
  locale: string;
  page_url?: string | null;
  device_type?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface MarketingEventPayload {
  campaign_id: string;
  event_type: MarketingEventType;
  locale: string;
  page_url?: string | null;
  device_type?: string | null;
  metadata?: Record<string, unknown>;
}

// ============================================
// USER PREFERENCES
// ============================================

export interface UserMarketingPreferences {
  id: string;
  user_id?: string | null;
  session_id?: string | null;
  marketing_enabled: boolean;
  newsletter_popups_enabled: boolean;
  promotional_banners_enabled: boolean;
  dismissed_campaigns: string[];
  created_at: string;
  updated_at: string;
}

// ============================================
// FORM DATA & REQUEST BODIES
// ============================================

export interface CampaignFormData {
  name: string;
  template_id?: string | null;
  status: MarketingCampaignStatus;

  title_en: string;
  title_fr: string;
  body_en?: string | null;
  body_fr?: string | null;
  cta_text_en?: string | null;
  cta_text_fr?: string | null;
  cta_url?: string | null;

  image_url?: string | null;
  background_image_url?: string | null;

  start_at?: string | null;
  end_at?: string | null;

  targeting_rules: TargetingRules;
  trigger_type: MarketingTriggerType;
  trigger_config: TriggerConfig;
  priority: number;
}

export type CreateCampaignRequest = CampaignFormData;

export interface UpdateCampaignRequest extends Partial<CampaignFormData> {
  id: string;
}

// ============================================
// API RESPONSES
// ============================================

export interface MarketingApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface EventTrackingResponse {
  success: boolean;
  deduplicated?: boolean;
  error?: string;
}

export interface ActiveCampaignsResponse {
  campaigns: ActiveCampaignDisplay[];
}

export interface CampaignStatsResponse {
  activeCampaigns: number;
  totalViews: number;
  totalClicks: number;
  avgCTR: string;
}

// ============================================
// STORE STATE
// ============================================

export interface DismissedCampaign {
  id: string;
  dismissedAt: number;
  cooldownHours: number;
}

export interface MarketingStoreState {
  dismissedCampaigns: DismissedCampaign[];
  fingerprint: string;

  isDismissed: (campaignId: string) => boolean;
  dismissCampaign: (campaignId: string, cooldownHours: number) => void;
  trackEvent: (campaignId: string, eventType: MarketingEventType) => Promise<void>;
  setFingerprint: (fingerprint: string) => void;
}
