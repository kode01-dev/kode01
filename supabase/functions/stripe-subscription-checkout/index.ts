import { getEdgeEnv } from '../_shared/env.ts';
import {
  badRequest,
  internalServerError,
  isInternalAuthorized,
  json,
  methodNotAllowed,
  unauthorized,
} from '../_shared/http.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';

const DEFAULT_SUBSCRIPTION_REDIRECT_PATH = '/pricing';
const CHECKOUT_SESSION_PLACEHOLDER = '{CHECKOUT_SESSION_ID}';
const PLAN_KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/;

type SubscriptionPlanRow = {
  stripe_price_id: string;
  feature_key: string;
};

const schema = z.object({
  userId: z.string().uuid(),
  userEmail: z.string().email().optional(),
  plan: z.string().trim().min(1).max(64),
  locale: z.string().optional(),
});

function normalizeLocale(input: string | undefined) {
  if (!input) return 'en';
  return input.toLowerCase() === 'fr' ? 'fr' : 'en';
}

function normalizePlanKey(value: string) {
  return value.trim().toLowerCase();
}

function parseRecordEnv(value: string | undefined, key: string): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${key} must be a JSON object`);
    }

    const result: Record<string, string> = {};
    for (const [rawPlan, rawValue] of Object.entries(parsed)) {
      const plan = normalizePlanKey(rawPlan);
      if (!PLAN_KEY_REGEX.test(plan)) {
        throw new Error(`${key} contains invalid plan key: ${rawPlan}`);
      }

      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        throw new Error(`${key}.${rawPlan} must be a non-empty string`);
      }

      result[plan] = rawValue.trim();
    }

    return result;
  } catch (error) {
    throw new Error(
      `Invalid ${key}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildPlanPriceMap() {
  const env = getEdgeEnv();
  const planPriceMap: Record<string, string> = {};

  if (env.stripeBasicPriceId) {
    planPriceMap.basic = env.stripeBasicPriceId;
  }

  if (env.stripeProPriceId) {
    planPriceMap.pro = env.stripeProPriceId;
  }

  Object.assign(
    planPriceMap,
    parseRecordEnv(env.stripeSubscriptionPlanPriceIds, 'STRIPE_SUBSCRIPTION_PLAN_PRICE_IDS'),
  );

  return planPriceMap;
}

async function resolvePlanConfigFromDb(plan: string): Promise<SubscriptionPlanRow | null> {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('stripe_price_id, feature_key')
    .eq('plan_key', plan)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    if (error.message?.toLowerCase().includes('subscription_plans')) {
      // Backward compatibility before migration rollout.
      return null;
    }
    throw new Error(`Failed to load subscription plan config: ${error.message}`);
  }

  return (data as SubscriptionPlanRow | null) ?? null;
}

function resolveFeatureKey(plan: string) {
  const env = getEdgeEnv();
  const featureKeyByPlan = parseRecordEnv(
    env.stripeSubscriptionFeatureKeyByPlan,
    'STRIPE_SUBSCRIPTION_FEATURE_KEY_BY_PLAN',
  );

  if (featureKeyByPlan[plan]) {
    return featureKeyByPlan[plan];
  }

  if (env.stripeSubscriptionFeatureKey) {
    return env.stripeSubscriptionFeatureKey;
  }

  return `marketplace.${plan}_fee_discount`;
}

function normalizeRedirectPath(value: string | undefined) {
  const raw = (value ?? DEFAULT_SUBSCRIPTION_REDIRECT_PATH).trim();
  if (!raw) return DEFAULT_SUBSCRIPTION_REDIRECT_PATH;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function buildLocalizedPath(locale: string, path: string) {
  if (/^\/(en|fr)(\/|$)/.test(path)) {
    return path;
  }

  return `/${locale}${path}`;
}

function appendQuery(url: string, query: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function buildRedirectUrls(args: {
  locale: string;
}) {
  const env = getEdgeEnv();
  const baseUrl = env.appBaseUrl;
  const successPath = buildLocalizedPath(
    args.locale,
    normalizeRedirectPath(env.stripeSubscriptionSuccessPath),
  );
  const cancelPath = buildLocalizedPath(
    args.locale,
    normalizeRedirectPath(env.stripeSubscriptionCancelPath),
  );

  const successBase = new URL(successPath, `${baseUrl}/`).toString();
  const cancelBase = new URL(cancelPath, `${baseUrl}/`).toString();

  return {
    successUrl: appendQuery(
      successBase,
      `subscription=success&session_id=${CHECKOUT_SESSION_PLACEHOLDER}`,
    ),
    cancelUrl: appendQuery(cancelBase, 'subscription=cancel'),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { userId, userEmail, locale } = parsed.data;
  const plan = normalizePlanKey(parsed.data.plan);

  if (!PLAN_KEY_REGEX.test(plan)) {
    return badRequest('Invalid plan key');
  }

  const stripe = getStripe();

  try {
    const dbPlanConfig = await resolvePlanConfigFromDb(plan);
    const planPriceMap = buildPlanPriceMap();
    const priceId = dbPlanConfig?.stripe_price_id ?? planPriceMap[plan];

    if (!priceId) {
      return badRequest(`Unsupported plan "${plan}" or missing price mapping`);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) return badRequest('Profile not found');

    const currentLocale = normalizeLocale(locale);
    const featureKey = dbPlanConfig?.feature_key ?? resolveFeatureKey(plan);
    const { successUrl, cancelUrl } = buildRedirectUrls({
      locale: currentLocale,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      adaptive_pricing: {
        enabled: true,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        kind: 'subscription_plan',
        userId,
        plan,
        featureKey,
      },
      client_reference_id: userId,
      customer: profile.stripe_customer_id ?? undefined,
      customer_email: profile.stripe_customer_id ? undefined : userEmail,
      subscription_data: {
        metadata: {
          kind: 'subscription_plan',
          userId,
          plan,
          featureKey,
        },
      },
    });

    return json({
      sessionId: session.id,
      url: session.url,
      plan,
    });
  } catch (error) {
    console.error('stripe-subscription-checkout error:', error);
    return internalServerError();
  }
});
