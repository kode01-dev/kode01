# Vendor Integration Guide (v1)

## 1) Architecture (v1)

- KODE01 creates purchases on successful Stripe checkout.
- If `products.generates_license_key = true`, KODE01 creates a `license_keys` row.
- Buyer access to KODE01 product stays purchase-based (`purchases`), so access is immediate after checkout processing.
- Vendor app entitlement is handled with:
  - `POST /api/licenses/verify`
  - `POST /api/licenses/activate` (idempotency required)
  - outbound webhook `license.issued` signed with HMAC (`x-kode01-signature`)

## 2) Seller setup in KODE01

1. Open vendor dashboard (`/vendor` or `/fr/vendor`).
2. In **My products**, use **Auto license** toggle for each product.
3. Configure integration (one row per seller) in `vendor_license_integrations`:
   - `enabled = true`
   - `api_secret` for server-to-server API auth
   - `webhook_url` to receive `license.issued`
   - `webhook_secret` to verify HMAC signature

Example SQL:

```sql
insert into public.vendor_license_integrations (
  seller_id,
  enabled,
  api_secret,
  webhook_url,
  webhook_secret
) values (
  'SELLER_UUID',
  true,
  'YOUR_LONG_RANDOM_API_SECRET',
  'https://vendor-app.example.com/webhooks/kode01/license-issued',
  'YOUR_LONG_RANDOM_WEBHOOK_SECRET'
)
on conflict (seller_id)
do update set
  enabled = excluded.enabled,
  api_secret = excluded.api_secret,
  webhook_url = excluded.webhook_url,
  webhook_secret = excluded.webhook_secret,
  updated_at = now();
```

## 3) Verify + activate flow in vendor app

1. Receive user license key in your app.
2. Call `POST /api/licenses/verify`.
3. If `canActivate=true`, call `POST /api/licenses/activate` with your `idempotencyKey`.
4. Grant entitlement in your app only when `activationStatus` is `activated` or `replayed`.

Pseudo-code:

```ts
const verify = await fetch('https://kode01.com/api/licenses/verify', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KODE01_API_SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ licenseKey, productId }),
}).then((r) => r.json());

if (!verify.canActivate) throw new Error('License cannot be activated');

const activation = await fetch('https://kode01.com/api/licenses/activate', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KODE01_API_SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    licenseKey,
    productId,
    externalUserRef: userId,
    idempotencyKey: `activate:${productId}:${licenseKey}:${userId}`,
  }),
}).then((r) => r.json());

if (activation.activationStatus === 'activated' || activation.activationStatus === 'replayed') {
  grantEntitlement(userId, productId);
}
```

## 4) Outbound webhook (`license.issued`)

Payload:

```json
{
  "eventId": "uuid",
  "eventType": "license.issued",
  "occurredAt": "2026-03-10T20:15:00.000Z",
  "purchaseId": "uuid",
  "productId": "uuid",
  "licenseKey": "uuid",
  "buyerRef": "uuid"
}
```

Headers:

- `x-kode01-signature: sha256=<hex>`
- `x-kode01-event-id`
- `x-kode01-event-type`

Signature verification:

```ts
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(rawBody: string, secret: string, header: string | null) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

Retry behavior:

- Immediate delivery attempt at issuance.
- If delivery fails: status becomes `retrying` then retried with exponential backoff.
- Final state is `sent` or `failed` (after max attempts).

## 5) Production checklist

- Use long random secrets (`api_secret`, `webhook_secret`) and rotate regularly.
- Keep idempotency store in vendor app for activation and webhook event IDs.
- Set outbound request timeout (5-10s) and retry policy in vendor app.
- Accept only HTTPS webhook endpoints.
- Reject webhook if signature invalid or event already processed.
- Log `eventId`, `purchaseId`, `productId`, and `x-request-id` for correlation.
