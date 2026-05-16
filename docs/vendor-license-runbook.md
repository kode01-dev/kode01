# Vendor License Runbook (Incidents)

## 1) Webhook not delivered

Symptoms:

- Vendor app did not receive `license.issued`.
- Buyer purchase is completed in KODE01.

Checks:

```sql
select id, event_id, status, attempt_count, max_attempts, next_attempt_at, last_error, last_response_status
from public.license_webhook_deliveries
where purchase_id = 'PURCHASE_UUID'
order by created_at desc;
```

Actions:

1. Validate vendor `webhook_url` and `webhook_secret` in `vendor_license_integrations`.
2. Verify vendor endpoint responds `2xx` within timeout.
3. Trigger retry worker manually:
   - `POST /api/cron/license-webhooks` with cron auth header.
4. If status is `failed`, reset for replay:

```sql
update public.license_webhook_deliveries
set status = 'retrying',
    next_attempt_at = now(),
    last_error = null
where id = 'DELIVERY_UUID';
```

## 2) Activation rejected

Common reasons:

- `license_not_found`
- `seller_mismatch`
- `purchase_not_completed`
- `license_not_active`
- `max_uses_exceeded`

Checks:

```sql
select *
from public.license_activation_events
where seller_id = 'SELLER_UUID'
  and idempotency_key = 'IDEMPOTENCY_KEY'
limit 1;
```

```sql
select lk.*, p.status as purchase_status
from public.license_keys lk
join public.purchases p on p.id = lk.purchase_id
where lk.key = 'LICENSE_KEY'
  and lk.product_id = 'PRODUCT_UUID';
```

Actions:

1. Fix caller payload (wrong `productId`, wrong key, missing idempotency policy).
2. Re-run `verify` before retrying activation.
3. For `max_uses_exceeded`, treat as consumed entitlement and stop retries.

## 3) Key revoked but should be valid

Checks:

```sql
select id, key, status, uses_count, max_uses, purchase_id
from public.license_keys
where key = 'LICENSE_KEY';
```

Action (controlled rollback):

```sql
update public.license_keys
set status = 'active'
where id = 'LICENSE_KEY_UUID';
```

Then re-run `verify` and `activate` with a new idempotency key.

## 4) Over-consumption (`uses_count` too high)

Checks:

```sql
select key, uses_count, max_uses
from public.license_keys
where id = 'LICENSE_KEY_UUID';
```

```sql
select idempotency_key, status, reason, created_at
from public.license_activation_events
where license_key_id = 'LICENSE_KEY_UUID'
order by created_at desc;
```

Actions:

1. Validate vendor idempotency implementation.
2. Ensure each app action reuses same `idempotencyKey` on retry.
3. Add reconciliation script to flag anomalies (`uses_count > max_uses`).

## 5) Stripe webhook replay / duplicate concerns

Checks:

```sql
select event_id, type, status, processed_at, error_message
from public.stripe_webhook_events
where event_id = 'STRIPE_EVENT_ID';
```

Behavior:

- Duplicate Stripe event IDs are ignored after first lock insert.
- Purchases remain protected by unique Stripe IDs in `purchases`.

## 6) Correlation and audit

Correlate with:

- Request header: `x-request-id`
- Tables:
  - `stripe_webhook_events`
  - `license_activation_events`
  - `license_webhook_deliveries`
  - `audit_logs`
