import 'server-only';

import { z } from 'zod';
import { normalizeEnvValue } from './normalize';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CONNECT_THIN_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CONNECT_CALLBACK_BASE_URL: z.string().url().optional(),
  STRIPE_CONNECT_STATE_SECRET: z.string().min(32).optional(),
  STRIPE_BASIC_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
  BASIC_PRICE_ID: z.string().min(1).optional(),
  PRO_PRICE_ID: z.string().min(1).optional(),
  STRIPE_SUBSCRIPTION_FEATURE_KEY: z.string().min(1).optional(),
  STRIPE_CONNECTED_ACCOUNT_COUNTRY: z.string().min(2).max(2).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  ABANDONED_CART_BATCH_SIZE: z.coerce.number().int().min(1).max(500).optional(),
  ABANDONED_CART_SEND_BATCH_SIZE: z.coerce.number().int().min(1).max(100).optional(),
  BREVO_API_KEY: z.string().min(1).optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().min(1).optional(),
  NOTIF_EMAIL_PROVIDER: z.string().min(1).optional(),
  NOTIF_PROVIDER_URL: z.string().url().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  APP_BRAND_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  CRON_SECRET_NEXT: z.string().min(1).optional(),
  ORDER_INCIDENT_SLA_DAYS: z.coerce.number().int().min(1).max(30).optional(),
  LICENSE_WEBHOOK_BATCH_SIZE: z.coerce.number().int().min(1).max(200).optional(),
  LICENSE_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).optional(),
  APP_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  SUPABASE_FUNCTIONS_URL: z.string().url().optional(),
  EDGE_INTERNAL_AUTH_TOKEN: z.string().min(16).optional(),
  EDGE_INTERNAL_AUTH_TOKEN_NEXT: z.string().min(16).optional(),
  RATE_LIMIT_FAILURE_MODE: z.enum(['open', 'closed', 'hybrid']).optional(),
  RATE_LIMIT_GLOBAL_API_ENABLED: z.string().optional(),
  RATE_LIMIT_WEBHOOK_EXEMPTIONS: z.string().optional(),
  BOT_BLOCKED_UA_SUBSTRINGS: z.string().optional(),
  ADS_CLICK_ALLOWED_EXTERNAL_HOSTS: z.string().optional(),
  CSP_ENFORCE: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL_PRIMARY: z.string().min(1).optional(),
  ANTHROPIC_MODEL_FALLBACK: z.string().min(1).optional(),
  SENDFOX_API_TOKEN: z.string().min(1).optional(),
  SENDFOX_LIST_ID: z.string().min(1).optional(),
  SENDFOX_API_BASE_URL: z.string().url().optional(),
  RECAP_MAX_SOURCES: z.coerce.number().int().positive().optional(),
  RECAP_TIMEZONE: z.string().min(1).optional(),
  RECAP_RETRY_CUTOFF_HOUR: z.coerce.number().int().min(1).max(23).optional(),
  GITHUB_ACCESS_TOKEN: z.string().min(1).optional(),
  HUGGINGFACE_ACCESS_TOKEN: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_ADSENSE_CLIENT_ID: z.string().min(1).optional(),
  ZIPCHAT_JWT_PRIVATE_KEY: z.string().min(1).optional(),
  AGENT_EXECUTION_MODE: z.enum(['vercel', 'modal']).optional(),
  MODAL_AGENT_API_URL: z.string().url().optional(),
  AGENT_INTERNAL_TOKEN: z.string().min(16).optional(),
  AGENT_INTERNAL_TOKEN_NEXT: z.string().min(16).optional(),
  AGENT_INTERNAL_AUTH_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(900).optional(),
  AUDIT_LOG_INTEGRITY_SECRET: z.string().min(16).optional(),
  AUDIT_LOG_INTEGRITY_KEY_ID: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

export class MissingServerEnvError extends Error {
  readonly keys: string[];

  constructor(keys: string[]) {
    super(`Missing required environment variables: ${keys.join(', ')}`);
    this.name = 'MissingServerEnvError';
    this.keys = keys;
  }
}

export function getServerEnv(): ServerEnv {
  const normalizedProcessEnv = Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [key, normalizeEnvValue(value)]),
  );

  const parsed = envSchema.partial().safeParse(normalizedProcessEnv);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid server environment variables: ${fields}`);
  }

  return parsed.data as ServerEnv;
}

export function getRequiredServerEnv<K extends keyof ServerEnv>(
  keys: K[],
): ServerEnv & { [P in K]-?: NonNullable<ServerEnv[P]> } {
  const env = getServerEnv();
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    if (isBuildPhase) {
      console.warn(`⚠️ Missing required environment variables during build: ${missing.join(', ')}. Using build-time fallbacks.`);
      // Return a proxy or the partial env during build to avoid crashing top-level module initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return env as any;
    }
    throw new MissingServerEnvError(missing);
  }

  return env as ServerEnv & { [P in K]-?: NonNullable<ServerEnv[P]> };
}

export function getAppBaseUrl(): string {
  const env = getServerEnv();
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const candidate =
    env.APP_BASE_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!candidate && env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  if (!candidate) {
    if (isBuildPhase) {
      return 'http://build-time-fallback.local';
    }
    throw new Error(
      'APP_BASE_URL (or NEXT_PUBLIC_APP_URL) is required in production for secure redirect URLs.',
    );
  }

  return candidate.replace(/\/+$/, '');
}
