export type RateLimitAction =
  | 'PASSWORD_CHANGE'
  | 'LOGIN'
  | 'SIGNUP'
  | 'PASSWORD_RESET'
  | 'AI_GENERATION'
  | 'AI_EXTRACT_CV'
  | 'GENERATE_BIO'
  | 'SMART_MATCH'
  | 'EMAIL_CHECK'
  | 'GLOBAL_PAGE'
  | 'GLOBAL_API'
  | 'CONTACT_FORM'
  | 'PUCK_LEADS'
  | 'PRELAUNCH_ACCESS'
  | 'STRIPE_CHECKOUT'
  | 'NEWSLETTER_SUBSCRIBE'
  | 'AD_EVENT'
  | 'LOCKSCREEN_UNLOCK'
  | 'LICENSE_API'
  | 'ARTICLE_CLAP'
  | 'WEBHOOK_REPLAY';

export type RateLimitSchema = {
  limit: number;
  windowSeconds: number;
};

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const globalPageLimit = parsePositiveIntEnv(process.env.RATE_LIMIT_GLOBAL_PAGE_LIMIT, 800);
const globalPageWindowSeconds = parsePositiveIntEnv(process.env.RATE_LIMIT_GLOBAL_PAGE_WINDOW_SECONDS, 15 * 60);

export const RATE_LIMIT_SCHEMAS: Record<RateLimitAction, RateLimitSchema> = {
  PASSWORD_CHANGE: { limit: 3, windowSeconds: 60 * 60 },
  LOGIN: { limit: 5, windowSeconds: 15 * 60 },
  SIGNUP: { limit: 3, windowSeconds: 60 * 60 },
  PASSWORD_RESET: { limit: 3, windowSeconds: 60 * 60 },
  AI_GENERATION: { limit: 10, windowSeconds: 60 },
  AI_EXTRACT_CV: { limit: 10, windowSeconds: 60 },
  GENERATE_BIO: { limit: 10, windowSeconds: 60 },
  SMART_MATCH: { limit: 10, windowSeconds: 60 },
  EMAIL_CHECK: { limit: 5, windowSeconds: 15 * 60 },
  GLOBAL_PAGE: { limit: globalPageLimit, windowSeconds: globalPageWindowSeconds },
  GLOBAL_API: { limit: 100, windowSeconds: 15 * 60 },
  CONTACT_FORM: { limit: 5, windowSeconds: 60 },
  PUCK_LEADS: { limit: 4, windowSeconds: 60 },
  PRELAUNCH_ACCESS: { limit: 10, windowSeconds: 15 * 60 },
  STRIPE_CHECKOUT: { limit: 5, windowSeconds: 60 },
  NEWSLETTER_SUBSCRIBE: { limit: 3, windowSeconds: 60 },
  AD_EVENT: { limit: 50, windowSeconds: 60 },
  LOCKSCREEN_UNLOCK: { limit: 10, windowSeconds: 15 * 60 },
  LICENSE_API: { limit: 120, windowSeconds: 60 },
  ARTICLE_CLAP: { limit: 30, windowSeconds: 60 },
  WEBHOOK_REPLAY: { limit: 20, windowSeconds: 60 },
};

export const ENDPOINT_RATE_LIMIT_ACTIONS: Record<string, RateLimitAction> = {
  '/api/contact': 'CONTACT_FORM',
  '/api/puck/leads': 'PUCK_LEADS',
  '/api/stripe/checkout': 'STRIPE_CHECKOUT',
  '/api/stripe/subscription-checkout': 'STRIPE_CHECKOUT',
  '/api/stripe/customer-portal': 'STRIPE_CHECKOUT',
  '/api/stripe/payment-method-status': 'STRIPE_CHECKOUT',
  '/api/cart/checkout': 'STRIPE_CHECKOUT',
  '/api/newsletter/subscribe': 'NEWSLETTER_SUBSCRIBE',
  '/api/ads/events': 'AD_EVENT',
  '/api/webhooks/stripe-connect-thin': 'WEBHOOK_REPLAY',
  '/api/lockscreen/unlock': 'LOCKSCREEN_UNLOCK',
  '/api/licenses/verify': 'LICENSE_API',
  '/api/licenses/activate': 'LICENSE_API',
  '/api/claps': 'ARTICLE_CLAP',
};

export const HYBRID_FAIL_CLOSED_ACTIONS = new Set<RateLimitAction>([
  'AI_GENERATION',
  'AI_EXTRACT_CV',
  'GENERATE_BIO',
  'SMART_MATCH',
  'PASSWORD_CHANGE',
  'EMAIL_CHECK',
  'CONTACT_FORM',
  'STRIPE_CHECKOUT',
  'NEWSLETTER_SUBSCRIBE',
  'LOCKSCREEN_UNLOCK',
  'LICENSE_API',
  'WEBHOOK_REPLAY',
]);
