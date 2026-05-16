export interface LockscreenConfig {
  is_enabled: boolean;
  auth_gate_enabled: boolean;
  title_en: string;
  title_fr: string;
  message_en: string;
  message_fr: string;
  newsletter_enabled: boolean;
  newsletter_title_en: string;
  newsletter_title_fr: string;
  newsletter_cta_en: string;
  newsletter_cta_fr: string;
}

export interface LockscreenAdminConfig extends LockscreenConfig {
  id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}
