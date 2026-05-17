import type Stripe from 'https://esm.sh/stripe@20.4.0?target=deno';
import { getEdgeEnv } from '../_shared/env.ts';
import { badRequest, internalServerError, isInternalAuthorized, json, methodNotAllowed } from '../_shared/http.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === '23505' || error.message?.toLowerCase().includes('duplicate key');
}

const LICENSE_WEBHOOK_MAX_ATTEMPTS = 6;
const PLAN_KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const WEBHOOK_PROCESSING_STALE_MS = 15 * 60 * 1000;

type SubscriptionPlanCatalogItem = {
  planKey: string;
  stripePriceId: string | null;
  featureKey: string;
  grantsProEntitlement: boolean;
};

type SubscriptionPlanCatalog = {
  byPlan: Map<string, SubscriptionPlanCatalogItem>;
  byPriceId: Map<string, SubscriptionPlanCatalogItem>;
};

function parsePlanPriceMap(value: string | undefined): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [rawPlan, rawPriceId] of Object.entries(parsed)) {
      const plan = rawPlan.trim().toLowerCase();
      if (!PLAN_KEY_REGEX.test(plan)) continue;
      if (typeof rawPriceId !== 'string' || rawPriceId.trim() === '') continue;
      result[plan] = rawPriceId.trim();
    }

    return result;
  } catch {
    return {};
  }
}

function parseFeatureKeyMap(value: string | undefined): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [rawPlan, rawFeatureKey] of Object.entries(parsed)) {
      const plan = rawPlan.trim().toLowerCase();
      if (!PLAN_KEY_REGEX.test(plan)) continue;
      if (typeof rawFeatureKey !== 'string' || rawFeatureKey.trim() === '') continue;
      result[plan] = rawFeatureKey.trim();
    }

    return result;
  } catch {
    return {};
  }
}

function resolveEntitledPlanKeys() {
  const env = getEdgeEnv();
  const configured = (env.stripeSubscriptionProPlanKeys ?? 'pro')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => PLAN_KEY_REGEX.test(value));

  if (configured.length === 0) return new Set(['pro']);
  return new Set(configured);
}

function resolveFeatureKeyFallback(plan: string): string {
  const env = getEdgeEnv();
  const map = parseFeatureKeyMap(env.stripeSubscriptionFeatureKeyByPlan);
  if (map[plan]) return map[plan];
  if (env.stripeSubscriptionFeatureKey) return env.stripeSubscriptionFeatureKey;
  return `marketplace.${plan}_fee_discount`;
}

function isMissingSubscriptionPlansRelation(error: { message?: string }) {
  return error.message?.toLowerCase().includes('subscription_plans') ?? false;
}

async function loadSubscriptionPlanCatalog(): Promise<SubscriptionPlanCatalog> {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('plan_key, stripe_price_id, feature_key, grants_pro_entitlement')
    .eq('is_active', true);

  const byPlan = new Map<string, SubscriptionPlanCatalogItem>();
  const byPriceId = new Map<string, SubscriptionPlanCatalogItem>();

  if (error && !isMissingSubscriptionPlansRelation(error)) {
    throw error;
  }

  if (!error && data && data.length > 0) {
    for (const row of data as Array<{
      plan_key: string;
      stripe_price_id: string;
      feature_key: string;
      grants_pro_entitlement: boolean;
    }>) {
      const planKey = row.plan_key.trim().toLowerCase();
      if (!PLAN_KEY_REGEX.test(planKey)) continue;
      const item: SubscriptionPlanCatalogItem = {
        planKey,
        stripePriceId: row.stripe_price_id,
        featureKey: row.feature_key,
        grantsProEntitlement: Boolean(row.grants_pro_entitlement),
      };
      byPlan.set(planKey, item);
      byPriceId.set(row.stripe_price_id, item);
    }

    return { byPlan, byPriceId };
  }

  const env = getEdgeEnv();
  const priceMap: Record<string, string> = {
    ...parsePlanPriceMap(env.stripeSubscriptionPlanPriceIds),
  };

  if (env.stripeBasicPriceId) {
    priceMap.basic = env.stripeBasicPriceId;
  }

  if (env.stripeProPriceId) {
    priceMap.pro = env.stripeProPriceId;
  }

  const featureMap = parseFeatureKeyMap(env.stripeSubscriptionFeatureKeyByPlan);
  const entitledPlanKeys = resolveEntitledPlanKeys();

  const planKeys = new Set<string>([
    ...Object.keys(priceMap),
    ...Object.keys(featureMap),
    ...entitledPlanKeys.values(),
  ]);

  for (const planKey of planKeys) {
    if (!PLAN_KEY_REGEX.test(planKey)) continue;
    const item: SubscriptionPlanCatalogItem = {
      planKey,
      stripePriceId: priceMap[planKey] ?? null,
      featureKey: resolveFeatureKeyFallback(planKey),
      grantsProEntitlement: entitledPlanKeys.has(planKey),
    };

    byPlan.set(planKey, item);
    if (item.stripePriceId) {
      byPriceId.set(item.stripePriceId, item);
    }
  }

  return { byPlan, byPriceId };
}

function bytesToHex(input: ArrayBuffer): string {
  return [...new Uint8Array(input)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function buildWebhookSignature(payloadText: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payloadText);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, payloadData);
  return `sha256=${bytesToHex(signature)}`;
}

async function enqueueLicenseIssuedWebhookEvent(params: {
  purchaseId: string;
  productId: string;
  sellerId: string;
  buyerRef: string;
  licenseKeyId: string;
  licenseKey: string;
}) {
  const { data: integration, error: integrationError } = await supabaseAdmin
    .from('vendor_license_integrations')
    .select('enabled, webhook_url, webhook_secret')
    .eq('seller_id', params.sellerId)
    .maybeSingle();

  if (integrationError) {
    console.error('Failed to resolve vendor license integration:', integrationError);
    return;
  }

  if (!integration?.enabled || !integration.webhook_url || !integration.webhook_secret) {
    return;
  }

  const eventId = crypto.randomUUID();
  const eventType = 'license.issued';
  const occurredAt = new Date().toISOString();
  const payload = {
    eventId,
    eventType,
    occurredAt,
    purchaseId: params.purchaseId,
    productId: params.productId,
    licenseKey: params.licenseKey,
    buyerRef: params.buyerRef,
  };
  const payloadText = JSON.stringify(payload);
  const signature = await buildWebhookSignature(payloadText, integration.webhook_secret);

  const { error: deliveryInsertError } = await supabaseAdmin
    .from('license_webhook_deliveries')
    .insert({
      event_id: eventId,
      event_type: eventType,
      seller_id: params.sellerId,
      product_id: params.productId,
      purchase_id: params.purchaseId,
      license_key_id: params.licenseKeyId,
      endpoint_url: integration.webhook_url,
      payload,
      signature,
      status: 'pending',
      attempt_count: 0,
      max_attempts: LICENSE_WEBHOOK_MAX_ATTEMPTS,
      next_attempt_at: occurredAt,
    })
    .select('id')
    .single();

  if (deliveryInsertError) {
    console.error('Failed to enqueue vendor license webhook delivery:', deliveryInsertError);
  }
}

function getStripeOnboardingState(account: Stripe.Account) {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);
  const canSell = chargesEnabled && payoutsEnabled;

  return {
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    canSell,
  };
}

async function syncSellerStripeAccountState(account: Stripe.Account) {
  const state = getStripeOnboardingState(account);
  const onboardingCompletedAt = state.canSell ? new Date().toISOString() : null;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_charges_enabled: state.chargesEnabled,
      stripe_payouts_enabled: state.payoutsEnabled,
      stripe_details_submitted: state.detailsSubmitted,
      stripe_onboarding_completed_at: onboardingCompletedAt,
      is_verified: state.canSell,
    })
    .eq('stripe_account_id', account.id);

  if (error) throw error;
}

async function markWebhookStatus(eventId: string, status: 'processed' | 'failed', errorMessage?: string) {
  await supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
      locked_at: null,
    })
    .eq('event_id', eventId);
}

type WebhookEventStatus = 'processing' | 'processed' | 'failed';

type WebhookLockOutcome =
  | { kind: 'acquired'; replayedFromFailed: boolean }
  | { kind: 'already_processed' }
  | { kind: 'already_processing' }
  | { kind: 'error'; message: string };

function normalizeWebhookStatus(value: unknown): WebhookEventStatus | null {
  if (value === 'processing' || value === 'processed' || value === 'failed') return value;
  return null;
}

async function getWebhookStatus(eventId: string): Promise<{ status: WebhookEventStatus; lockedAt: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('status, locked_at')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error || !data) return null;
  const status = normalizeWebhookStatus((data as { status?: unknown }).status);
  if (!status) return null;
  const lockedAt = typeof (data as { locked_at?: unknown }).locked_at === 'string'
    ? (data as { locked_at: string }).locked_at
    : null;
  return { status, lockedAt };
}

async function acquireWebhookEventLock(event: Stripe.Event): Promise<WebhookLockOutcome> {
  const { error: lockError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      type: event.type,
      status: 'processing',
      error_message: null,
      processed_at: null,
      locked_at: new Date().toISOString(),
    });

  if (!lockError) {
    return { kind: 'acquired', replayedFromFailed: false };
  }

  if (!isUniqueViolation(lockError)) {
    return { kind: 'error', message: `Failed to lock webhook event: ${lockError.message}` };
  }

  const existing = await getWebhookStatus(event.id);
  if (existing?.status === 'processed') return { kind: 'already_processed' };
  if (existing?.status === 'processing') {
    const lockedAtMs = existing.lockedAt ? new Date(existing.lockedAt).getTime() : 0;
    const isStale = !lockedAtMs || Number.isNaN(lockedAtMs) || Date.now() - lockedAtMs > WEBHOOK_PROCESSING_STALE_MS;
    if (!isStale) return { kind: 'already_processing' };
  } else if (existing?.status !== 'failed') {
    return { kind: 'error', message: `Unexpected webhook status for ${event.id}` };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      type: event.type,
      status: 'processing',
      error_message: null,
      processed_at: null,
      locked_at: new Date().toISOString(),
    })
    .eq('event_id', event.id)
    .in('status', existing?.status === 'processing' ? ['processing'] : ['failed'])
    .select('event_id')
    .maybeSingle();

  if (updateError) {
    return { kind: 'error', message: `Failed to transition failed webhook event: ${updateError.message}` };
  }

  if (updated) {
    return { kind: 'acquired', replayedFromFailed: existing?.status === 'failed' };
  }

  const latest = await getWebhookStatus(event.id);
  if (latest?.status === 'processed') return { kind: 'already_processed' };
  if (latest?.status === 'processing') return { kind: 'already_processing' };
  return { kind: 'error', message: `Failed to acquire replay lock for webhook event ${event.id}` };
}

function extractReplayEventId(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const candidate = typeof parsed.replay_event_id === 'string'
      ? parsed.replay_event_id
      : typeof parsed.event_id === 'string'
        ? parsed.event_id
        : typeof parsed.eventId === 'string'
          ? parsed.eventId
          : null;
    const normalized = candidate?.trim();
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

function getReplayRequesterKey(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const requestId = req.headers.get('x-request-id')?.trim();
  return forwardedFor || requestId || 'unknown';
}

async function setProfileStripeCustomerId(userId: string, customerId: string) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId);

  if (!error) return;

  if (error.message?.toLowerCase().includes('stripe_customer_id')) {
    // Keep webhook functional during phased migration rollout.
    console.warn('profiles.stripe_customer_id is not available yet; skipping customer mapping');
    return;
  }

  throw error;
}

async function syncBuyerStripeCustomerId(buyerId: string, session: Stripe.Checkout.Session) {
  if (typeof session.customer !== 'string') return;
  await setProfileStripeCustomerId(buyerId, session.customer);
}

function fromUnixTimestamp(timestampSeconds: number | null | undefined): string | null {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) return null;
  return new Date(timestampSeconds * 1000).toISOString();
}

async function resolveSubscriptionPlan(subscription: Stripe.Subscription): Promise<{
  plan: string;
  featureKey: string;
  grantsProEntitlement: boolean;
}> {
  const catalog = await loadSubscriptionPlanCatalog();
  const metadataPlan = subscription.metadata?.plan?.trim().toLowerCase();
  if (metadataPlan && PLAN_KEY_REGEX.test(metadataPlan)) {
    const fromCatalog = catalog.byPlan.get(metadataPlan);
    if (fromCatalog) {
      return {
        plan: fromCatalog.planKey,
        featureKey: fromCatalog.featureKey,
        grantsProEntitlement: fromCatalog.grantsProEntitlement,
      };
    }
  }

  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId) {
    const fromCatalog = catalog.byPriceId.get(priceId);
    if (fromCatalog) {
      return {
        plan: fromCatalog.planKey,
        featureKey: fromCatalog.featureKey,
        grantsProEntitlement: fromCatalog.grantsProEntitlement,
      };
    }
  }

  if (metadataPlan && PLAN_KEY_REGEX.test(metadataPlan)) {
    return {
      plan: metadataPlan,
      featureKey: resolveFeatureKeyFallback(metadataPlan),
      grantsProEntitlement: resolveEntitledPlanKeys().has(metadataPlan),
    };
  }

  return {
    plan: 'unknown',
    featureKey: resolveFeatureKeyFallback('unknown'),
    grantsProEntitlement: false,
  };
}

async function resolveSubscriptionUserId(subscription: Stripe.Subscription): Promise<string> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
  const metadataUserId = subscription.metadata?.userId;

  if (customerId) {
    const { data: profileByCustomer, error: profileByCustomerError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (profileByCustomerError && !profileByCustomerError.message?.toLowerCase().includes('stripe_customer_id')) {
      throw profileByCustomerError;
    }

    if (profileByCustomer?.id) {
      return profileByCustomer.id;
    }
  }

  if (metadataUserId) {
    if (customerId) {
      await setProfileStripeCustomerId(metadataUserId, customerId);
    }
    return metadataUserId;
  }

  throw new Error('Unable to resolve profile for subscription event');
}

async function processCustomerSubscriptionEvent(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await resolveSubscriptionUserId(subscription);
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
  const stripePriceId = subscription.items.data[0]?.price?.id ?? null;
  const resolvedPlan = await resolveSubscriptionPlan(subscription);
  const subscriptionPlan = resolvedPlan.plan;
  const featureKey = resolvedPlan.featureKey;

  const isSubscriptionActive = subscription.status === 'active' || subscription.status === 'trialing';
  const shouldActivateEntitlement = isSubscriptionActive && resolvedPlan.grantsProEntitlement;
  const endsAt = shouldActivateEntitlement
    ? (subscription.cancel_at_period_end ? fromUnixTimestamp(subscription.current_period_end) : null)
    : (
      fromUnixTimestamp(subscription.ended_at) ??
      fromUnixTimestamp(subscription.canceled_at) ??
      fromUnixTimestamp(subscription.current_period_end) ??
      new Date().toISOString()
    );

  const startsAt =
    fromUnixTimestamp(subscription.start_date) ??
    fromUnixTimestamp(subscription.current_period_start) ??
    new Date().toISOString();

  const { error: entitlementError } = await supabaseAdmin
    .from('billing_entitlements')
    .upsert(
      {
        user_id: userId,
        source: 'stripe',
        feature_key: featureKey,
        feature_value: subscriptionPlan,
        is_active: shouldActivateEntitlement,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: stripePriceId,
        starts_at: startsAt,
        ends_at: endsAt,
        metadata: {
          stripe_status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
          canceled_at: fromUnixTimestamp(subscription.canceled_at),
          current_period_start: fromUnixTimestamp(subscription.current_period_start),
          current_period_end: fromUnixTimestamp(subscription.current_period_end),
          latest_event_type: event.type,
        },
      },
      { onConflict: 'user_id,source,feature_key,stripe_subscription_id' },
    );

  if (entitlementError) {
    if (entitlementError.message?.toLowerCase().includes('billing_entitlements')) {
      // Keep webhook functional during phased migration rollout.
      console.warn('billing_entitlements is not available yet; skipping entitlement projection');
    } else {
      throw entitlementError;
    }
  }

  const profileUpdate: {
    plan_type: 'free' | 'pro';
    stripe_customer_id?: string;
  } = {
    plan_type: shouldActivateEntitlement ? 'pro' : 'free',
  };

  if (customerId) {
    profileUpdate.stripe_customer_id = customerId;
  }

  const { error: profileUpdateError } = await supabaseAdmin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', userId);

  if (!profileUpdateError) return;

  if (
    customerId &&
    profileUpdateError.message?.toLowerCase().includes('stripe_customer_id')
  ) {
    const { error: fallbackProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ plan_type: shouldActivateEntitlement ? 'pro' : 'free' })
      .eq('id', userId);

    if (!fallbackProfileError) return;
    throw fallbackProfileError;
  }

  throw profileUpdateError;
}

type CheckoutProductRow = {
  id: string;
  seller_id: string;
  generates_license_key: boolean;
  is_bundle: boolean;
};

type PurchaseResolution = {
  id: string;
  created: boolean;
};

type BundleItemLinkRow = {
  product_id: string;
};

type BundleIncludedProductRow = {
  id: string;
  seller_id: string;
  generates_license_key: boolean;
  is_bundle: boolean;
};

type CartCheckoutPurchaseItem = {
  cartItemId: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  sellerId: string;
  title: string;
  amount: number;
  amountCents: number;
  applicationFeeCents: number | null;
  sellerPayoutCents: number | null;
  generatesLicenseKey: boolean;
  isBundle: boolean;
};

type LicenseResolution = {
  id: string;
  key: string;
  created: boolean;
};

type CheckoutPaymentReadiness = {
  ready: boolean;
  reason: string;
  paymentIntent: Stripe.PaymentIntent | null;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
};

function getCheckoutSessionAmountTotalCents(session: Stripe.Checkout.Session): number {
  return typeof session.amount_total === 'number' ? session.amount_total : 0;
}

function isZeroAmountCheckout(session: Stripe.Checkout.Session): boolean {
  return getCheckoutSessionAmountTotalCents(session) === 0;
}

async function resolveCheckoutPaymentReadiness(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<CheckoutPaymentReadiness> {
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;
  const paymentIntent = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId) : null;
  const noPaymentRequired = session.payment_status === 'no_payment_required' && isZeroAmountCheckout(session);
  const ready =
    session.payment_status === 'paid' ||
    paymentIntent?.status === 'succeeded' ||
    noPaymentRequired;

  const amountCents = paymentIntent
    ? (paymentIntent.amount_received || paymentIntent.amount || getCheckoutSessionAmountTotalCents(session))
    : getCheckoutSessionAmountTotalCents(session);

  return {
    ready,
    reason: ready
      ? paymentIntent?.status ?? session.payment_status ?? 'ready'
      : `payment_not_settled:${session.payment_status ?? 'unknown'}:${paymentIntent?.status ?? 'no_payment_intent'}`,
    paymentIntent,
    paymentIntentId,
    amountCents,
    currency: (paymentIntent?.currency ?? session.currency ?? 'usd').toLowerCase(),
    applicationFeeCents: paymentIntent?.application_fee_amount || 0,
  };
}

function logCheckoutAwaitingPayment(
  kind: string | undefined,
  session: Stripe.Checkout.Session,
  payment: CheckoutPaymentReadiness,
) {
  console.info('Checkout session is not ready for fulfillment; awaiting settled payment', {
    kind: kind ?? null,
    checkout_session_id: session.id,
    payment_status: session.payment_status,
    payment_intent_id: payment.paymentIntentId,
    payment_intent_status: payment.paymentIntent?.status ?? null,
    reason: payment.reason,
  });
}

async function redeemCouponForPurchase(params: {
  couponId: string | null;
  userId: string;
  purchaseId: string;
  amountSaved: number;
}) {
  if (!params.couponId) return;

  const { data, error } = await supabaseAdmin.rpc('redeem_coupon_usage', {
    p_coupon_id: params.couponId,
    p_user_id: params.userId,
    p_purchase_id: params.purchaseId,
    p_amount_saved: Math.max(0, params.amountSaved),
  });

  if (error) {
    console.error('Failed to redeem coupon usage from webhook:', error);
    return;
  }

  if (data !== true) {
    console.warn('Coupon redemption skipped by redeem_coupon_usage RPC', {
      couponId: params.couponId,
      userId: params.userId,
      purchaseId: params.purchaseId,
    });
  }
}

async function resolveOrCreateMainPurchase(params: {
  buyerId: string;
  productId: string;
  sellerId: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string;
  amount: number;
  currency: string;
  commissionKode01: number;
  sellerPayout: number;
  affiliateId: string | null;
  affiliateCommission: number;
}): Promise<PurchaseResolution> {
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .insert({
      buyer_id: params.buyerId,
      product_id: params.productId,
      seller_id: params.sellerId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_checkout_session_id: params.stripeCheckoutSessionId,
      amount: params.amount,
      currency: params.currency,
      commission_kode01: params.commissionKode01,
      seller_payout: params.sellerPayout,
      affiliate_id: params.affiliateId,
      affiliate_commission: params.affiliateCommission,
      status: 'completed',
      is_bundle_derived: false,
      source_bundle_purchase_id: null,
    })
    .select('id')
    .single();

  if (!error) {
    if (data?.id) return { id: data.id, created: true };
    throw new Error('Purchase insert returned empty payload');
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existingBySession, error: existingBySessionError } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('stripe_checkout_session_id', params.stripeCheckoutSessionId)
    .maybeSingle();
  if (existingBySessionError) throw existingBySessionError;
  if (existingBySession?.id) return { id: existingBySession.id, created: false };

  if (params.stripePaymentIntentId) {
    const { data: existingByIntent, error: existingByIntentError } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('stripe_payment_intent_id', params.stripePaymentIntentId)
      .maybeSingle();
    if (existingByIntentError) throw existingByIntentError;
    if (existingByIntent?.id) return { id: existingByIntent.id, created: false };
  }

  throw new Error('Failed to resolve existing purchase after unique conflict');
}

function parseCartItemIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const deduped = new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  return [...deduped];
}

function splitProportionalCents(totalCents: number, weights: number[]): number[] {
  if (totalCents <= 0 || weights.length === 0) return weights.map(() => 0);

  const normalizedWeights = weights.map((value) => Math.max(0, Math.floor(value)));
  const weightSum = normalizedWeights.reduce((sum, value) => sum + value, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const rawShares = normalizedWeights.map((weight) => (totalCents * weight) / weightSum);
  const flooredShares = rawShares.map((value) => Math.floor(value));
  let remainder = totalCents - flooredShares.reduce((sum, value) => sum + value, 0);

  if (remainder > 0) {
    const byRemainder = rawShares
      .map((value, index) => ({ index, fraction: value - flooredShares[index] }))
      .sort((a, b) => b.fraction - a.fraction);

    let pointer = 0;
    while (remainder > 0 && byRemainder.length > 0) {
      const target = byRemainder[pointer % byRemainder.length];
      flooredShares[target.index] += 1;
      remainder -= 1;
      pointer += 1;
    }
  }

  return flooredShares;
}

async function resolveOrCreateCartItemPurchase(params: {
  buyerId: string;
  sellerId: string;
  productId: string;
  variantId: string | null;
  cartId: string;
  cartItemId: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string;
  amount: number;
  currency: string;
  commissionKode01: number;
  sellerPayout: number;
}): Promise<PurchaseResolution> {
  const { data: existingByCartItem, error: existingByCartItemError } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('cart_item_id', params.cartItemId)
    .maybeSingle();
  if (existingByCartItemError) throw existingByCartItemError;
  if (existingByCartItem?.id) return { id: existingByCartItem.id, created: false };

  const { data, error } = await supabaseAdmin
    .from('purchases')
    .insert({
      buyer_id: params.buyerId,
      product_id: params.productId,
      seller_id: params.sellerId,
      variant_id: params.variantId,
      cart_id: params.cartId,
      cart_item_id: params.cartItemId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_checkout_session_id: params.stripeCheckoutSessionId,
      amount: params.amount,
      currency: params.currency,
      commission_kode01: params.commissionKode01,
      seller_payout: params.sellerPayout,
      affiliate_id: null,
      affiliate_commission: 0,
      status: 'completed',
      is_bundle_derived: false,
      source_bundle_purchase_id: null,
    })
    .select('id')
    .single();

  if (!error) {
    if (data?.id) return { id: data.id, created: true };
    throw new Error('Cart purchase insert returned empty payload');
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('cart_item_id', params.cartItemId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { id: existing.id, created: false };

  throw new Error('Failed to resolve existing cart purchase after unique conflict');
}

async function resolveOrCreateCommerceOrder(params: {
  buyerId: string;
  currency: string;
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      buyer_id: params.buyerId,
      status: 'paid',
      currency: params.currency,
      subtotal_cents: params.subtotalCents,
      tax_cents: 0,
      fee_cents: params.feeCents,
      total_cents: params.totalCents,
      stripe_checkout_session_id: params.stripeCheckoutSessionId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
    })
    .select('id')
    .single();

  if (!error) {
    if (data?.id) return data.id;
    throw new Error('Order insert returned empty payload');
  }

  if (!isUniqueViolation(error)) throw error;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('stripe_checkout_session_id', params.stripeCheckoutSessionId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;
  throw new Error('Failed to resolve existing order after unique conflict');
}

async function resolveOrCreateCommercePayment(params: {
  orderId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: string;
  status: 'succeeded' | 'failed';
  failureReason?: string | null;
}) {
  const { error } = await supabaseAdmin
    .from('payments')
    .insert({
      order_id: params.orderId,
      provider: 'stripe',
      provider_payment_intent_id: params.stripePaymentIntentId,
      provider_checkout_session_id: params.stripeCheckoutSessionId,
      amount_cents: params.amountCents,
      currency: params.currency,
      status: params.status,
      failure_reason: params.failureReason ?? null,
      raw_metadata: {},
    });

  if (!error || isUniqueViolation(error)) return;
  throw error;
}

async function resolveOrCreateCommerceOrderItem(params: {
  orderId: string;
  sellerId: string;
  productId: string;
  variantId: string | null;
  purchaseId: string;
  amountCents: number;
  platformFeeCents: number;
  sellerPayoutCents: number;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('order_items')
    .select('id')
    .eq('purchase_id', params.purchaseId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return;

  const { error } = await supabaseAdmin
    .from('order_items')
    .insert({
      order_id: params.orderId,
      seller_id: params.sellerId,
      product_id: params.productId,
      variant_id: params.variantId,
      purchase_id: params.purchaseId,
      amount_cents: params.amountCents,
      platform_fee_cents: params.platformFeeCents,
      seller_payout_cents: params.sellerPayoutCents,
      fulfillment_status: 'fulfilled',
    });

  if (!error || isUniqueViolation(error)) return;
  throw error;
}

async function resolveOrCreateBundleDerivedPurchase(params: {
  sourceBundlePurchaseId: string;
  buyerId: string;
  productId: string;
  sellerId: string;
  currency: string;
}): Promise<PurchaseResolution> {
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .insert({
      buyer_id: params.buyerId,
      product_id: params.productId,
      seller_id: params.sellerId,
      stripe_payment_intent_id: null,
      stripe_checkout_session_id: null,
      amount: 0,
      currency: params.currency,
      commission_kode01: 0,
      seller_payout: 0,
      affiliate_id: null,
      affiliate_commission: 0,
      status: 'completed',
      is_bundle_derived: true,
      source_bundle_purchase_id: params.sourceBundlePurchaseId,
    })
    .select('id')
    .single();

  if (!error) {
    if (data?.id) return { id: data.id, created: true };
    throw new Error('Bundle-derived purchase insert returned empty payload');
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('source_bundle_purchase_id', params.sourceBundlePurchaseId)
    .eq('buyer_id', params.buyerId)
    .eq('product_id', params.productId)
    .eq('is_bundle_derived', true)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { id: existing.id, created: false };

  throw new Error('Failed to resolve existing bundle-derived purchase after unique conflict');
}

async function resolveOrCreateLicenseKey(params: {
  purchaseId: string;
  productId: string;
  generatesLicenseKey: boolean;
}): Promise<LicenseResolution | null> {
  if (!params.generatesLicenseKey) return null;

  const { data: existingLicense, error: existingLicenseError } = await supabaseAdmin
    .from('license_keys')
    .select('id, key')
    .eq('purchase_id', params.purchaseId)
    .limit(1)
    .maybeSingle();
  if (existingLicenseError) {
    throw new Error(`Failed to check license key: ${existingLicenseError.message}`);
  }
  if (existingLicense) {
    return {
      id: existingLicense.id,
      key: existingLicense.key,
      created: false,
    };
  }

  const { data: licenseData, error: licenseInsertError } = await supabaseAdmin
    .from('license_keys')
    .insert({
      purchase_id: params.purchaseId,
      product_id: params.productId,
      key: crypto.randomUUID(),
      status: 'active',
      uses_count: 0,
    })
    .select('id, key')
    .single();

  if (!licenseInsertError) {
    if (!licenseData) {
      throw new Error('License insert returned empty payload');
    }
    return {
      id: licenseData.id,
      key: licenseData.key,
      created: true,
    };
  }

  if (!isUniqueViolation(licenseInsertError)) {
    throw new Error(`Failed to create license key: ${licenseInsertError?.message ?? 'unknown error'}`);
  }

  const { data: raceWinner, error: raceWinnerError } = await supabaseAdmin
    .from('license_keys')
    .select('id, key')
    .eq('purchase_id', params.purchaseId)
    .limit(1)
    .maybeSingle();
  if (raceWinnerError) {
    throw new Error(`Failed to resolve existing license key after conflict: ${raceWinnerError.message}`);
  }
  if (!raceWinner) {
    throw new Error('Failed to resolve existing license key after conflict');
  }

  return {
    id: raceWinner.id,
    key: raceWinner.key,
    created: false,
  };
}

async function schedulePurchaseEmails(params: {
  purchaseId: string;
  buyerId: string;
}) {
  const day0 = new Date();
  const day1 = new Date();
  const day7 = new Date();
  day1.setDate(day1.getDate() + 1);
  day7.setDate(day7.getDate() + 7);

  const { error: scheduledEmailsError } = await supabaseAdmin.from('scheduled_emails').insert([
    {
      purchase_id: params.purchaseId,
      buyer_id: params.buyerId,
      email_type: 'purchase_confirmation',
      scheduled_for: day0.toISOString(),
      status: 'pending',
    },
    {
      purchase_id: params.purchaseId,
      buyer_id: params.buyerId,
      email_type: 'day_1_followup',
      scheduled_for: day1.toISOString(),
      status: 'pending',
    },
    {
      purchase_id: params.purchaseId,
      buyer_id: params.buyerId,
      email_type: 'day_7_review',
      scheduled_for: day7.toISOString(),
      status: 'pending',
    },
  ]);

  if (scheduledEmailsError) {
    throw new Error(`Failed to schedule follow-up emails: ${scheduledEmailsError.message}`);
  }
}

async function fanOutBundleDerivedPurchases(params: {
  sourceBundlePurchaseId: string;
  buyerId: string;
  bundleProductId: string;
  currency: string;
}) {
  const { data: linkRows, error: linkError } = await supabaseAdmin
    .from('product_bundle_items')
    .select('product_id')
    .eq('bundle_id', params.bundleProductId);
  if (linkError) {
    throw new Error(`Failed to load bundle items: ${linkError.message}`);
  }

  const itemIds = Array.from(new Set(((linkRows ?? []) as BundleItemLinkRow[]).map((row) => row.product_id)));
  if (itemIds.length === 0) return;

  const { data: productsData, error: productsError } = await supabaseAdmin
    .from('products')
    .select('id, seller_id, generates_license_key, is_bundle')
    .in('id', itemIds);
  if (productsError) {
    throw new Error(`Failed to load bundle included products: ${productsError.message}`);
  }

  const includedProducts = ((productsData ?? []) as BundleIncludedProductRow[]).filter((item) => item.is_bundle === false);
  await Promise.all(
    includedProducts.map(async (item) => {
      const derivedPurchase = await resolveOrCreateBundleDerivedPurchase({
        sourceBundlePurchaseId: params.sourceBundlePurchaseId,
        buyerId: params.buyerId,
        productId: item.id,
        sellerId: item.seller_id,
        currency: params.currency,
      });

      const derivedLicense = await resolveOrCreateLicenseKey({
        purchaseId: derivedPurchase.id,
        productId: item.id,
        generatesLicenseKey: item.generates_license_key,
      });

      if (derivedLicense?.created) {
        try {
          await enqueueLicenseIssuedWebhookEvent({
            purchaseId: derivedPurchase.id,
            productId: item.id,
            sellerId: item.seller_id,
            buyerRef: params.buyerId,
            licenseKeyId: derivedLicense.id,
            licenseKey: derivedLicense.key,
          });
        } catch (deliveryError) {
          console.error('Failed to dispatch vendor license webhook event for bundle-derived purchase:', deliveryError);
        }
      }
    }),
  );
}

async function finalizeCartAfterSellerCheckout(params: {
  cartId: string;
  cartItemIds: string[];
}) {
  if (params.cartItemIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('cart_id', params.cartId)
      .in('id', params.cartItemIds);
    if (deleteError) {
      throw new Error(`Failed to remove purchased cart items: ${deleteError.message}`);
    }
  }

  const { count: remainingCount, error: countError } = await supabaseAdmin
    .from('cart_items')
    .select('id', { head: true, count: 'exact' })
    .eq('cart_id', params.cartId);
  if (countError) {
    throw new Error(`Failed to count remaining cart items: ${countError.message}`);
  }

  const nextStatus = (remainingCount ?? 0) === 0 ? 'completed' : 'active';
  const { error: cartUpdateError } = await supabaseAdmin
    .from('carts')
    .update({ status: nextStatus })
    .eq('id', params.cartId);
  if (cartUpdateError) {
    throw new Error(`Failed to update cart status after checkout: ${cartUpdateError.message}`);
  }
}

async function processCartMultiVendorCheckoutCompleted(event: Stripe.Event) {
  const stripe = getStripe();
  const session = event.data.object as Stripe.Checkout.Session;

  const buyerId = session.metadata?.buyerId;
  const cartId = session.metadata?.cartId;
  const sellerId = session.metadata?.sellerId;
  const cartItemIds = parseCartItemIds(session.metadata?.cartItemIds);

  if (!buyerId || !cartId || !sellerId || cartItemIds.length === 0) {
    throw new Error('Missing cart checkout metadata (buyerId/cartId/sellerId/cartItemIds)');
  }

  const payment = await resolveCheckoutPaymentReadiness(stripe, session);
  if (!payment.ready) {
    logCheckoutAwaitingPayment(session.metadata?.kind, session, payment);
    return;
  }

  await syncBuyerStripeCustomerId(buyerId, session);

  const paymentCurrency = payment.currency;
  const applicationFeeCents = payment.applicationFeeCents;

  const { data: snapshotRows, error: snapshotError } = await supabaseAdmin
    .from('checkout_session_items')
    .select(`
      cart_item_id,
      cart_id,
      product_id,
      variant_id,
      seller_id,
      amount_cents,
      application_fee_cents,
      seller_payout_cents,
      currency,
      products!inner(
        id,
        title,
        seller_id,
        status,
        generates_license_key,
        is_bundle
      )
    `)
    .eq('stripe_checkout_session_id', session.id)
    .eq('cart_id', cartId)
    .eq('seller_id', sellerId)
    .in('cart_item_id', cartItemIds);

  if (snapshotError) {
    throw new Error(`Failed to load checkout session snapshots: ${snapshotError.message}`);
  }

  const { data: rawCartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select(`
      id,
      cart_id,
      product_id,
      variant_id,
      price_snapshot,
      products!inner(
        id,
        title,
        seller_id,
        status,
        generates_license_key,
        is_bundle
      )
    `)
    .eq('cart_id', cartId)
    .in('id', cartItemIds);

  if (cartItemsError) {
    throw new Error(`Failed to load cart items for checkout: ${cartItemsError.message}`);
  }

  const normalizedByCartItemId = new Map<string, CartCheckoutPurchaseItem>();

  for (const rawRow of (snapshotRows ?? []) as Array<{
    cart_item_id: string;
    cart_id: string;
    product_id: string;
    variant_id: string | null;
    seller_id: string;
    amount_cents: number;
    application_fee_cents: number;
    seller_payout_cents: number;
    currency: string;
    products:
      | {
          id: string;
          title: string | null;
          seller_id: string;
          status: string;
          generates_license_key: boolean;
          is_bundle: boolean;
        }
      | Array<{
          id: string;
          title: string | null;
          seller_id: string;
          status: string;
          generates_license_key: boolean;
          is_bundle: boolean;
        }>
      | null;
  }>) {
    const product = Array.isArray(rawRow.products) ? rawRow.products[0] : rawRow.products;
    if (!product) continue;

    if (product.status !== 'published') {
      throw new Error(`Product ${rawRow.product_id} is no longer published`);
    }
    if (product.seller_id !== sellerId || rawRow.seller_id !== sellerId) {
      throw new Error(`Checkout snapshot ${rawRow.cart_item_id} does not belong to seller ${sellerId}`);
    }
    if (rawRow.amount_cents <= 0) {
      throw new Error(`Checkout snapshot ${rawRow.cart_item_id} has an invalid amount`);
    }

    normalizedByCartItemId.set(rawRow.cart_item_id, {
      cartItemId: rawRow.cart_item_id,
      cartId: rawRow.cart_id,
      productId: rawRow.product_id,
      variantId: rawRow.variant_id ?? null,
      sellerId: product.seller_id,
      title: product.title ?? 'Untitled product',
      amount: rawRow.amount_cents / 100,
      amountCents: rawRow.amount_cents,
      applicationFeeCents: rawRow.application_fee_cents,
      sellerPayoutCents: rawRow.seller_payout_cents,
      generatesLicenseKey: Boolean(product.generates_license_key),
      isBundle: Boolean(product.is_bundle),
    });
  }

  for (const rawRow of (rawCartItems ?? []) as Array<{
    id: string;
    cart_id: string;
    product_id: string;
    variant_id: string | null;
    price_snapshot: number | string;
    products:
      | {
          id: string;
          title: string | null;
          seller_id: string;
          status: string;
          generates_license_key: boolean;
          is_bundle: boolean;
        }
      | Array<{
          id: string;
          title: string | null;
          seller_id: string;
          status: string;
          generates_license_key: boolean;
          is_bundle: boolean;
        }>
      | null;
  }>) {
    if (normalizedByCartItemId.has(rawRow.id)) continue;

    const product = Array.isArray(rawRow.products) ? rawRow.products[0] : rawRow.products;
    if (!product) continue;

    if (product.status !== 'published') {
      throw new Error(`Product ${rawRow.product_id} is no longer published`);
    }
    if (product.seller_id !== sellerId) {
      throw new Error(`Cart item ${rawRow.id} does not belong to seller ${sellerId}`);
    }

    const amount = Number(rawRow.price_snapshot);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || amountCents <= 0) {
      throw new Error(`Cart item ${rawRow.id} has an invalid amount`);
    }

    normalizedByCartItemId.set(rawRow.id, {
      cartItemId: rawRow.id,
      cartId: rawRow.cart_id,
      productId: rawRow.product_id,
      variantId: rawRow.variant_id ?? null,
      sellerId: product.seller_id,
      title: product.title ?? 'Untitled product',
      amount,
      amountCents,
      applicationFeeCents: null,
      sellerPayoutCents: null,
      generatesLicenseKey: Boolean(product.generates_license_key),
      isBundle: Boolean(product.is_bundle),
    });
  }

  const orderedItems = cartItemIds
    .map((cartItemId) => normalizedByCartItemId.get(cartItemId))
    .filter((item): item is CartCheckoutPurchaseItem => Boolean(item));

  if (orderedItems.length !== cartItemIds.length) {
    const { data: existingPurchases, error: existingPurchasesError } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('cart_id', cartId)
      .eq('seller_id', sellerId)
      .eq('stripe_checkout_session_id', session.id)
      .in('cart_item_id', cartItemIds);

    if (existingPurchasesError) {
      throw existingPurchasesError;
    }

    if ((existingPurchases ?? []).length === cartItemIds.length) {
      await finalizeCartAfterSellerCheckout({ cartId, cartItemIds });
      return;
    }

    throw new Error('Unable to resolve all cart items referenced by checkout session metadata');
  }

  const itemAmountsCents = orderedItems.map((item) => item.amountCents);
  const itemFeeCents = splitProportionalCents(applicationFeeCents, itemAmountsCents);
  const orderId = await resolveOrCreateCommerceOrder({
    buyerId,
    currency: paymentCurrency,
    subtotalCents: itemAmountsCents.reduce((sum, amount) => sum + amount, 0),
    feeCents: applicationFeeCents,
    totalCents: payment.amountCents || itemAmountsCents.reduce((sum, amount) => sum + amount, 0),
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: payment.paymentIntentId,
  });

  await resolveOrCreateCommercePayment({
    orderId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: payment.paymentIntentId,
    amountCents: payment.amountCents || itemAmountsCents.reduce((sum, amount) => sum + amount, 0),
    currency: paymentCurrency,
    status: 'succeeded',
  });

  await supabaseAdmin.from('recommendation_events').insert({
    user_id: buyerId,
    event_type: 'checkout_completed',
    source_type: 'checkout',
    signal_payload: {
      cart_id: cartId,
      checkout_session_id: session.id,
      payment_intent_id: payment.paymentIntentId,
      seller_id: sellerId,
    },
  });

  for (let index = 0; index < orderedItems.length; index += 1) {
    const item = orderedItems[index];
    const commissionCents = item.applicationFeeCents ?? itemFeeCents[index] ?? 0;
    const amount = item.amountCents / 100;
    const commission = commissionCents / 100;
    const sellerPayoutCents = item.sellerPayoutCents ?? Math.max(item.amountCents - commissionCents, 0);
    const sellerPayout = sellerPayoutCents / 100;

    const purchase = await resolveOrCreateCartItemPurchase({
      buyerId,
      sellerId: item.sellerId,
      productId: item.productId,
      variantId: item.variantId,
      cartId: item.cartId,
      cartItemId: item.cartItemId,
      stripePaymentIntentId: payment.paymentIntentId,
      stripeCheckoutSessionId: session.id,
      amount,
      currency: paymentCurrency,
      commissionKode01: commission,
      sellerPayout,
    });

    await resolveOrCreateCommerceOrderItem({
      orderId,
      sellerId: item.sellerId,
      productId: item.productId,
      variantId: item.variantId,
      purchaseId: purchase.id,
      amountCents: item.amountCents,
      platformFeeCents: commissionCents,
      sellerPayoutCents,
    });

    const license = await resolveOrCreateLicenseKey({
      purchaseId: purchase.id,
      productId: item.productId,
      generatesLicenseKey: item.generatesLicenseKey,
    });

    if (item.isBundle) {
      await fanOutBundleDerivedPurchases({
        sourceBundlePurchaseId: purchase.id,
        buyerId,
        bundleProductId: item.productId,
        currency: paymentCurrency,
      });
    }

    if (purchase.created) {
      await schedulePurchaseEmails({
        purchaseId: purchase.id,
        buyerId,
      });
    }

    if (license?.created) {
      try {
        await enqueueLicenseIssuedWebhookEvent({
          purchaseId: purchase.id,
          productId: item.productId,
          sellerId: item.sellerId,
          buyerRef: buyerId,
          licenseKeyId: license.id,
          licenseKey: license.key,
        });
      } catch (deliveryError) {
        console.error('Failed to dispatch vendor license webhook event for cart purchase:', deliveryError);
      }
    }
  }

  await finalizeCartAfterSellerCheckout({ cartId, cartItemIds });
}

async function processCheckoutCompleted(event: Stripe.Event) {
  const stripe = getStripe();
  const session = event.data.object as Stripe.Checkout.Session;
  const kind = session.metadata?.kind;

  if (kind === 'cart_multi_vendor') {
    await processCartMultiVendorCheckoutCompleted(event);
    return;
  }

  if (kind === 'sponsored_blog') {
    await processSponsoredBlogCheckoutCompleted(event);
    return;
  }

  if (kind === 'ad_campaign') {
    await processAdCampaignCheckoutCompleted(event);
    return;
  }

  if (kind === 'subscription_plan') {
    const subscriptionUserId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
    if (!subscriptionUserId) {
      throw new Error('Missing checkout metadata userId for subscription');
    }
    await syncBuyerStripeCustomerId(subscriptionUserId, session);
    return;
  }

  const buyerId = session.metadata?.buyerId;
  const productId = session.metadata?.productId;
  const affiliateCode = session.metadata?.affiliateCode;
  const couponId = session.metadata?.couponId ?? null;

  if (!buyerId || !productId) {
    if (session.mode === 'subscription') {
      const fallbackUserId = session.client_reference_id ?? session.metadata?.userId;
      if (!fallbackUserId) {
        throw new Error('Missing subscription checkout user reference');
      }
      await syncBuyerStripeCustomerId(fallbackUserId, session);
      return;
    }
    throw new Error('Missing checkout metadata buyerId/productId');
  }

  const payment = await resolveCheckoutPaymentReadiness(stripe, session);
  if (!payment.ready) {
    logCheckoutAwaitingPayment(kind, session, payment);
    return;
  }

  await syncBuyerStripeCustomerId(buyerId, session);

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, seller_id, generates_license_key, is_bundle')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    throw new Error('Product not found for webhook event');
  }
  const checkoutProduct = product as CheckoutProductRow;

  const amountTotal = payment.amountCents / 100;
  const paymentCurrency = payment.currency;
  const amountSaved = (() => {
    const fromTotalDetails = session.total_details?.amount_discount;
    if (typeof fromTotalDetails === 'number') return Math.max(0, fromTotalDetails / 100);
    if (typeof session.amount_subtotal === 'number' && typeof session.amount_total === 'number') {
      return Math.max(0, (session.amount_subtotal - session.amount_total) / 100);
    }
    return 0;
  })();
  const applicationFeeCents = payment.applicationFeeCents;
  const commissionKode01 = applicationFeeCents / 100;

  let affiliateId: string | null = null;
  let affiliateCommission = 0;

  if (affiliateCode) {
    const { data: affiliate } = await supabaseAdmin
      .from('affiliates')
      .select('user_id, commission_rate')
      .eq('affiliate_code', affiliateCode)
      .eq('product_id', productId)
      .single();

    if (affiliate) {
      affiliateId = affiliate.user_id;
      affiliateCommission = amountTotal * (Number(affiliate.commission_rate) / 100);
    }
  }

  const sellerPayout = amountTotal - commissionKode01 - affiliateCommission;
  const mainPurchase = await resolveOrCreateMainPurchase({
    buyerId,
    productId,
    sellerId: checkoutProduct.seller_id,
    stripePaymentIntentId: payment.paymentIntentId,
    stripeCheckoutSessionId: session.id,
    amount: amountTotal,
    currency: paymentCurrency,
    commissionKode01,
    sellerPayout,
    affiliateId,
    affiliateCommission,
  });

  await supabaseAdmin.from('recommendation_events').insert({
    user_id: buyerId,
    event_type: 'checkout_completed',
    source_type: 'checkout',
    target_product_id: productId,
    signal_payload: {
      checkout_session_id: session.id,
      payment_intent_id: payment.paymentIntentId,
      seller_id: checkoutProduct.seller_id,
    },
  });

  await redeemCouponForPurchase({
    couponId,
    userId: buyerId,
    purchaseId: mainPurchase.id,
    amountSaved,
  });

  const mainLicense = await resolveOrCreateLicenseKey({
    purchaseId: mainPurchase.id,
    productId,
    generatesLicenseKey: checkoutProduct.generates_license_key,
  });

  if (checkoutProduct.is_bundle) {
    await fanOutBundleDerivedPurchases({
      sourceBundlePurchaseId: mainPurchase.id,
      buyerId,
      bundleProductId: productId,
      currency: paymentCurrency,
    });
  }

  if (mainPurchase.created) {
    await schedulePurchaseEmails({
      purchaseId: mainPurchase.id,
      buyerId,
    });
  }

  if (mainLicense?.created) {
    try {
      await enqueueLicenseIssuedWebhookEvent({
        purchaseId: mainPurchase.id,
        productId,
        sellerId: checkoutProduct.seller_id,
        buyerRef: buyerId,
        licenseKeyId: mainLicense.id,
        licenseKey: mainLicense.key,
      });
    } catch (deliveryError) {
      console.error('Failed to dispatch vendor license webhook event:', deliveryError);
    }
  }
}

async function processAdCampaignCheckoutCompleted(event: Stripe.Event) {
  const stripe = getStripe();
  const session = event.data.object as Stripe.Checkout.Session;
  const campaignId = session.metadata?.campaignId;
  const ownerUserId = session.metadata?.ownerUserId;

  if (!campaignId || !ownerUserId) {
    throw new Error('Missing ad campaign metadata campaignId/ownerUserId');
  }

  const payment = await resolveCheckoutPaymentReadiness(stripe, session);
  if (!payment.ready) {
    logCheckoutAwaitingPayment(session.metadata?.kind, session, payment);
    return;
  }

  const amountTotal = payment.amountCents / 100;
  const paymentCurrency = payment.currency;

  const { data: existingOrder } = await supabaseAdmin
    .from('ad_orders')
    .select('id, status')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (existingOrder?.status === 'paid') {
    return;
  }

  if (existingOrder?.id) {
    const { error: orderError } = await supabaseAdmin
      .from('ad_orders')
      .update({
        stripe_payment_intent_id: payment.paymentIntentId,
        amount: amountTotal,
        amount_usd: amountTotal,
        currency: paymentCurrency,
        status: 'paid',
      })
      .eq('id', existingOrder.id);
    if (orderError) throw orderError;
  } else {
    const { error: orderInsertError } = await supabaseAdmin
      .from('ad_orders')
      .insert({
        campaign_id: campaignId,
        owner_user_id: ownerUserId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: payment.paymentIntentId,
        amount: amountTotal,
        amount_usd: amountTotal,
        currency: paymentCurrency,
        status: 'paid',
      });
    if (orderInsertError && !isUniqueViolation(orderInsertError)) {
      throw orderInsertError;
    }
  }

  const { error: campaignError } = await supabaseAdmin
    .from('ad_campaigns')
    .update({
      is_paid: true,
      status: 'pending_review',
    })
    .eq('id', campaignId);

  if (campaignError) throw campaignError;

  const { error: inventoryError } = await supabaseAdmin.rpc('confirm_news_inventory', {
    p_campaign_id: campaignId,
  });

  if (inventoryError) {
    throw inventoryError;
  }
}

async function processSponsoredBlogCheckoutCompleted(event: Stripe.Event) {
  const stripe = getStripe();
  const session = event.data.object as Stripe.Checkout.Session;
  const translationGroupId = session.metadata?.translationGroupId;
  const ownerUserId = session.metadata?.ownerUserId;
  const orderId = session.metadata?.orderId;

  if (!translationGroupId || !ownerUserId) {
    throw new Error('Missing sponsored blog metadata translationGroupId/ownerUserId');
  }

  const payment = await resolveCheckoutPaymentReadiness(stripe, session);
  if (!payment.ready) {
    logCheckoutAwaitingPayment(session.metadata?.kind, session, payment);
    return;
  }

  const amountTotal = payment.amountCents / 100;
  const paymentCurrency = payment.currency;

  let paidOrderFound = false;

  if (orderId) {
    const { data: orderById, error: orderByIdError } = await supabaseAdmin
      .from('editorial_sponsorship_orders')
      .select('id, status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderByIdError) throw orderByIdError;

    if (orderById?.status === 'paid') {
      paidOrderFound = true;
    } else if (orderById?.id) {
      const { error: orderUpdateError } = await supabaseAdmin
        .from('editorial_sponsorship_orders')
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: payment.paymentIntentId,
          amount: amountTotal,
          currency: paymentCurrency,
          status: 'paid',
        })
        .eq('id', orderById.id);
      if (orderUpdateError) throw orderUpdateError;
      paidOrderFound = true;
    }
  }

  if (!paidOrderFound) {
    const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
      .from('editorial_sponsorship_orders')
      .select('id, status')
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();

    if (existingOrderError) throw existingOrderError;

    if (existingOrder?.status === 'paid') {
      paidOrderFound = true;
    } else if (existingOrder?.id) {
      const { error: existingOrderUpdateError } = await supabaseAdmin
        .from('editorial_sponsorship_orders')
        .update({
          stripe_payment_intent_id: payment.paymentIntentId,
          amount: amountTotal,
          currency: paymentCurrency,
          status: 'paid',
        })
        .eq('id', existingOrder.id);
      if (existingOrderUpdateError) throw existingOrderUpdateError;
      paidOrderFound = true;
    }
  }

  if (!paidOrderFound) {
    const { error: orderInsertError } = await supabaseAdmin
      .from('editorial_sponsorship_orders')
      .insert({
        translation_group_id: translationGroupId,
        owner_user_id: ownerUserId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: payment.paymentIntentId,
        amount: amountTotal,
        currency: paymentCurrency,
        status: 'paid',
      });
    if (orderInsertError && !isUniqueViolation(orderInsertError)) {
      throw orderInsertError;
    }
  }

  const { error: postsUpdateError } = await supabaseAdmin
    .from('editorial_posts')
    .update({
      sponsorship_status: 'pending_review',
      sponsored_submitted_at: new Date().toISOString(),
    })
    .eq('translation_group_id', translationGroupId)
    .eq('is_sponsored', true)
    .eq('sponsored_owner_user_id', ownerUserId);

  if (postsUpdateError) throw postsUpdateError;
}

async function processAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  await syncSellerStripeAccountState(account);
}

async function processCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== 'cart_multi_vendor') return;

  const cartId = session.metadata?.cartId;
  if (!cartId) return;

  const { error } = await supabaseAdmin
    .from('carts')
    .update({ status: 'active' })
    .eq('id', cartId)
    .eq('status', 'checkout_in_progress');

  if (error) throw error;
}

async function processCheckoutAsyncPaymentFailed(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const kind = session.metadata?.kind;

  if (kind === 'cart_multi_vendor') {
    await processCheckoutExpired(event);
    return;
  }

  if (kind === 'ad_campaign') {
    const campaignId = session.metadata?.campaignId;
    if (!campaignId) return;

    const { error: orderError } = await supabaseAdmin
      .from('ad_orders')
      .update({ status: 'failed' })
      .eq('stripe_checkout_session_id', session.id)
      .neq('status', 'paid');
    if (orderError) throw orderError;

    const { error: campaignError } = await supabaseAdmin
      .from('ad_campaigns')
      .update({ status: 'draft', is_paid: false })
      .eq('id', campaignId)
      .eq('status', 'pending_payment');
    if (campaignError) throw campaignError;

    const { error: inventoryError } = await supabaseAdmin
      .from('ad_inventory_reservations')
      .delete()
      .match({
        campaign_id: campaignId,
        placement_slug: 'news',
        status: 'hold',
      });
    if (inventoryError) throw inventoryError;
    return;
  }

  if (kind === 'sponsored_blog') {
    const orderId = session.metadata?.orderId;
    const translationGroupId = session.metadata?.translationGroupId;

    let orderError: { message?: string } | null = null;
    if (orderId) {
      ({ error: orderError } = await supabaseAdmin
        .from('editorial_sponsorship_orders')
        .update({ status: 'failed' })
        .eq('id', orderId)
        .neq('status', 'paid'));
    } else {
      ({ error: orderError } = await supabaseAdmin
        .from('editorial_sponsorship_orders')
        .update({ status: 'failed' })
        .eq('stripe_checkout_session_id', session.id)
        .neq('status', 'paid'));
    }
    if (orderError) throw orderError;

    if (translationGroupId) {
      const { error: postsError } = await supabaseAdmin
        .from('editorial_posts')
        .update({ sponsorship_status: 'pending_payment' })
        .eq('translation_group_id', translationGroupId)
        .eq('is_sponsored', true)
        .eq('sponsorship_status', 'pending_payment');
      if (postsError) throw postsError;
    }
  }
}

async function processPaymentIntentFailed(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const failureMessage = paymentIntent.last_payment_error?.message ?? 'Payment failed';

  const { data: order, error: orderLookupError } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();
  if (orderLookupError) throw orderLookupError;

  if (order?.id) {
    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', order.id);
    if (orderError) throw orderError;

    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'stripe',
        provider_payment_intent_id: paymentIntent.id,
        amount_cents: paymentIntent.amount,
        currency: (paymentIntent.currency ?? 'usd').toLowerCase(),
        status: 'failed',
        failure_reason: failureMessage,
        raw_metadata: {},
      });
    if (paymentError && !isUniqueViolation(paymentError)) throw paymentError;
  }

  const { error: purchaseError } = await supabaseAdmin
    .from('purchases')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id);
  if (purchaseError) throw purchaseError;
}

async function processChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!paymentIntentId) return;

  const fullyRefunded = (charge.amount_refunded ?? 0) >= charge.amount;
  if (!fullyRefunded) return;

  const now = new Date().toISOString();
  const { error: orderError } = await supabaseAdmin
    .from('orders')
    .update({ status: 'refunded', updated_at: now })
    .eq('stripe_payment_intent_id', paymentIntentId);
  if (orderError) throw orderError;

  const { error: paymentError } = await supabaseAdmin
    .from('payments')
    .update({ status: 'refunded', updated_at: now, provider_charge_id: charge.id })
    .eq('provider_payment_intent_id', paymentIntentId);
  if (paymentError) throw paymentError;

  const { error: purchaseError } = await supabaseAdmin
    .from('purchases')
    .update({ status: 'refunded' })
    .eq('stripe_payment_intent_id', paymentIntentId);
  if (purchaseError) throw purchaseError;
}

async function processChargeDispute(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : null;
  if (!chargeId) return;

  const { error } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'disputed',
      provider_charge_id: chargeId,
      updated_at: new Date().toISOString(),
      raw_metadata: {
        dispute_id: dispute.id,
        dispute_status: dispute.status,
        dispute_reason: dispute.reason,
      },
    })
    .eq('provider_charge_id', chargeId);

  if (error) throw error;
}

async function processStripeWebhookEvent(event: Stripe.Event) {
  if (event.type === 'checkout.session.completed') {
    await processCheckoutCompleted(event);
  } else if (event.type === 'checkout.session.async_payment_succeeded') {
    await processCheckoutCompleted(event);
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await processCheckoutAsyncPaymentFailed(event);
  } else if (event.type === 'checkout.session.expired') {
    await processCheckoutExpired(event);
  } else if (event.type === 'payment_intent.payment_failed') {
    await processPaymentIntentFailed(event);
  } else if (event.type === 'charge.refunded') {
    await processChargeRefunded(event);
  } else if (event.type.startsWith('charge.dispute.')) {
    await processChargeDispute(event);
  } else if (event.type === 'account.updated') {
    await processAccountUpdated(event);
  } else if (event.type.startsWith('customer.subscription.')) {
    await processCustomerSubscriptionEvent(event);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();

  const env = getEdgeEnv();
  if (!env.stripeWebhookSecret) return internalServerError();

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  const internalReplayAuthorized = !signature && isInternalAuthorized(req);
  const stripe = getStripe();
  let event: Stripe.Event;
  let source: 'webhook' | 'replay' = 'webhook';

  if (signature) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
    } catch (error) {
      console.error('Webhook signature error:', error);
      return badRequest('Invalid webhook signature');
    }
  } else {
    if (!internalReplayAuthorized) return badRequest('Missing stripe-signature');

    const replayRequesterKey = getReplayRequesterKey(req);
    const replayAllowed = await checkRateLimit({
      key: `stripe-webhook-replay:${replayRequesterKey}`,
      limit: 15,
      windowSeconds: 60,
    });
    if (!replayAllowed) {
      return json({ error: 'Replay rate limit exceeded', code: 'RATE_LIMITED' }, 429);
    }

    const replayEventId = extractReplayEventId(rawBody);
    if (!replayEventId) {
      return badRequest('Missing replay_event_id');
    }

    try {
      event = await stripe.events.retrieve(replayEventId);
      source = 'replay';
    } catch (error) {
      console.error('Webhook replay event retrieval error:', error);
      return badRequest('Invalid replay_event_id');
    }
  }

  const lockOutcome = await acquireWebhookEventLock(event);
  if (lockOutcome.kind === 'error') {
    console.error(lockOutcome.message);
    return internalServerError();
  }

  if (lockOutcome.kind === 'already_processed') {
    return json({ received: true, duplicate: true, status: 'processed', source });
  }

  if (lockOutcome.kind === 'already_processing') {
    return json({ received: true, duplicate: true, status: 'processing', source }, 202);
  }

  try {
    await processStripeWebhookEvent(event);
    await markWebhookStatus(event.id, 'processed');
    return json({
      received: true,
      source,
      replayed_from_failed: lockOutcome.replayedFromFailed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook processing error';
    console.error('Webhook processing error:', error);
    await markWebhookStatus(event.id, 'failed', message);
    return internalServerError();
  }
});
