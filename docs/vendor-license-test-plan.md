# Vendor License Test Plan (Release Gate)

## Scope

- Seller toggle (`PATCH /api/vendor/products/:productId/license`)
- Vendor verify/activate APIs
- Stripe checkout -> purchase -> key -> buyer visibility -> outbound webhook
- Retry engine (`/api/cron/license-webhooks`)

## 1) Integration API cases

### Seller toggle

- `200` seller owner can enable
- `200` seller owner can disable
- `401` no session
- `403` authenticated non-seller
- `404` product not owned / not found
- `400` invalid body

### Verify

- valid active key + completed purchase + available uses
- revoked key
- max uses reached
- unknown key
- wrong product for key
- disabled integration / wrong API secret

### Activate

- activated (first valid call)
- replayed (same idempotency key)
- rejected: max uses
- rejected: revoked
- rejected: purchase not completed
- rejected: unknown key
- malformed body (`idempotencyKey` missing)

### Concurrency

- two simultaneous activate calls:
  - same idempotency key -> one activation + replay semantics
  - different idempotency key -> only one consumes final allowed use

## 2) E2E business paths

- Stripe payment success:
  - purchase created (`status=completed`)
  - license key created when product flag is enabled
  - key visible in buyer dashboard
  - outbound `license.issued` row created and delivered/retried
  - KODE01 download access works immediately from purchase

- Product with `generates_license_key=false`:
  - purchase created
  - no key generated
  - buyer access still works by purchase entitlement

- Stripe webhook replay:
  - no duplicate purchase
  - no duplicate key creation

## 3) Resilience tests

- Vendor webhook endpoint returns 500:
  - delivery row enters `retrying`
  - attempt count increments
  - final state `sent` or `failed` after max attempts

- Vendor webhook timeout:
  - timeout captured in `last_error`
  - retries scheduled with backoff

- Email sender timeout during scheduled send:
  - email marked failed in `scheduled_emails`
  - purchase entitlement remains valid

## 4) SQL smoke checks after migration

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in (
    'stripe_charges_enabled',
    'stripe_payouts_enabled',
    'stripe_details_submitted',
    'stripe_onboarding_completed_at',
    'slug'
  );
```

```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in (
    'vendor_license_integrations',
    'license_activation_events',
    'license_webhook_deliveries'
  );
```

## 5) CI gates (must pass)

Run in order:

1. `npm run lint`
2. `npx tsc --noEmit --pretty false`
3. `npm run build`
4. Integration + E2E critical scenarios above
5. Migration smoke queries

Release rule:

- Do not deploy if any critical scenario fails.
