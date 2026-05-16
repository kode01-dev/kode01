# Stripe Sync Engine Migration Runbook

This runbook adds Stripe sync safely without breaking the current marketplace webhook logic.

## Goal

- Keep current marketplace logic (`purchases`, commissions, license keys, ad orders).
- Add a canonical Stripe data layer for subscriptions, billing support, and analytics.
- Move plan access decisions to `billing_entitlements`.

## 1) Apply base migration

Apply:

- `supabase/migrations/20260330000000_add_billing_entitlements_and_stripe_customer_map.sql`

This adds:

- `profiles.stripe_customer_id`
- `public.billing_entitlements`
- Views:
  - `public.active_billing_entitlements`
  - `public.seller_revenue_summary`

## 2) Deploy Stripe sync engine in parallel

- Deploy `stripe-sync-engine` to your Supabase/Postgres target.
- Keep existing webhook endpoint active during rollout.
- Configure Stripe webhook destinations so sync engine receives billing lifecycle events.

Minimum event families to include:

- `customer.*`
- `invoice.*`
- `payment_intent.*`
- `checkout.session.*`
- `customer.subscription.*`

Connect events can stay in your current webhook flow (`account.updated`) for onboarding state.

## 3) Keep current marketplace webhook as business projection

Do not remove your current webhook handlers for:

- insert `purchases`
- commission split computation
- license key issuance
- ad order payment confirmation
- seller connect state sync

These are domain-specific and should remain in your app.

## 4) Add entitlement projection logic

When `customer.subscription.*` changes:

- Resolve `profiles.id` from `profiles.stripe_customer_id`.
- Upsert entitlement rows into `billing_entitlements` by `stripe_subscription_id` + `feature_key`.
- Set:
  - `is_active = true` for active/trialing subscriptions
  - `is_active = false` and `ends_at = now()` for canceled/unpaid/incomplete expired

Suggested first feature key:

- `marketplace.pro_fee_discount`

## 5) Gradual read-path migration

Phase A:

- Keep existing `profiles.plan_type` checks in critical code paths.
- Add parallel checks against `active_billing_entitlements`.

Phase B:

- Switch feature gating to `active_billing_entitlements`.
- Keep `plan_type` as fallback for 1 release cycle.

Phase C:

- Remove legacy write paths that mutate `plan_type` directly from payment events.

## 6) Verification checklist

- One-time product payment still creates exactly one `purchases` row.
- Duplicate webhook replay remains idempotent.
- Connect onboarding toggles seller flags correctly.
- New subscription activation creates active entitlement.
- Subscription cancel/deactivation removes active entitlement.

## 7) Rollback strategy

- If sync engine has issues, disable its webhook destination.
- Keep existing webhook endpoint as source of truth for marketplace operations.
- Entitlement table can be temporarily ignored without breaking one-time sales.
