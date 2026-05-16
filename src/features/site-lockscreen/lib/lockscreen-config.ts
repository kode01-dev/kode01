import type { LockscreenConfig } from '../types';

export const DEFAULT_LOCKSCREEN_CONFIG: LockscreenConfig = {
  is_enabled: false,
  auth_gate_enabled: false,
  title_en: 'Coming Soon',
  title_fr: 'Bientot disponible',
  message_en: 'We are launching soon. Enter the password to access the site.',
  message_fr: 'Nous lancons bientot. Entrez le mot de passe pour acceder au site.',
  newsletter_enabled: true,
  newsletter_title_en: "Don't miss the launch",
  newsletter_title_fr: 'Ne manquez pas le lancement',
  newsletter_cta_en: 'Subscribe',
  newsletter_cta_fr: "S'abonner",
};

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().length > 0 ? value : fallback;
}

export function normalizeLockscreenConfig(raw: unknown): LockscreenConfig {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    is_enabled: coerceBoolean(data.is_enabled, DEFAULT_LOCKSCREEN_CONFIG.is_enabled),
    auth_gate_enabled: coerceBoolean(data.auth_gate_enabled, DEFAULT_LOCKSCREEN_CONFIG.auth_gate_enabled),
    title_en: coerceNonEmptyString(data.title_en, DEFAULT_LOCKSCREEN_CONFIG.title_en),
    title_fr: coerceNonEmptyString(data.title_fr, DEFAULT_LOCKSCREEN_CONFIG.title_fr),
    message_en: coerceNonEmptyString(data.message_en, DEFAULT_LOCKSCREEN_CONFIG.message_en),
    message_fr: coerceNonEmptyString(data.message_fr, DEFAULT_LOCKSCREEN_CONFIG.message_fr),
    newsletter_enabled: coerceBoolean(data.newsletter_enabled, DEFAULT_LOCKSCREEN_CONFIG.newsletter_enabled),
    newsletter_title_en: coerceNonEmptyString(
      data.newsletter_title_en,
      DEFAULT_LOCKSCREEN_CONFIG.newsletter_title_en
    ),
    newsletter_title_fr: coerceNonEmptyString(
      data.newsletter_title_fr,
      DEFAULT_LOCKSCREEN_CONFIG.newsletter_title_fr
    ),
    newsletter_cta_en: coerceNonEmptyString(data.newsletter_cta_en, DEFAULT_LOCKSCREEN_CONFIG.newsletter_cta_en),
    newsletter_cta_fr: coerceNonEmptyString(data.newsletter_cta_fr, DEFAULT_LOCKSCREEN_CONFIG.newsletter_cta_fr),
  };
}
