# Vendor License API Contract (v1)

Effective date: **March 10, 2026**

Base URL: `https://<your-domain>`

Auth for vendor server-to-server endpoints:

- Header: `Authorization: Bearer <api_secret>`
- Product ownership is validated internally (seller of `productId`).

## PATCH `/api/vendor/products/:productId/license`

Purpose: seller toggles per-product auto-license issuance.

Request body:

```json
{
  "generatesLicenseKey": true
}
```

Success `200`:

```json
{
  "productId": "uuid",
  "generatesLicenseKey": true,
  "updatedAt": "2026-03-10T20:25:00.000Z"
}
```

Common errors:

- `401` unauthorized session
- `403` not seller
- `404` product not found or not owned
- `400` invalid payload

## POST `/api/licenses/verify`

Purpose: validate if a license is currently activatable for a vendor product.

Request body:

```json
{
  "licenseKey": "uuid-or-string",
  "productId": "uuid"
}
```

Success `200`:

```json
{
  "valid": true,
  "status": "active",
  "purchaseStatus": "completed",
  "maxUses": 1,
  "usesCount": 0,
  "canActivate": true
}
```

Not found result (`200` business result):

```json
{
  "valid": false,
  "status": "not_found",
  "purchaseStatus": null,
  "maxUses": null,
  "usesCount": 0,
  "canActivate": false
}
```

## POST `/api/licenses/activate`

Purpose: atomically consume one activation use and return entitlement state.

Request body:

```json
{
  "licenseKey": "uuid-or-string",
  "productId": "uuid",
  "vendorUserId": "optional-string",
  "externalUserRef": "optional-string",
  "idempotencyKey": "required-unique-key"
}
```

Rules:

- `idempotencyKey` is mandatory.
- At least one of `vendorUserId` or `externalUserRef` is required.

Success `200`:

```json
{
  "valid": true,
  "canActivate": true,
  "activationStatus": "activated",
  "reason": null,
  "idempotencyKey": "activate:...",
  "entitlement": {
    "licenseKeyId": "uuid",
    "purchaseId": "uuid",
    "productId": "uuid",
    "sellerId": "uuid",
    "usesCount": 1,
    "maxUses": 1,
    "keyStatus": "active",
    "replayed": false
  }
}
```

Idempotent replay (`200`):

```json
{
  "valid": true,
  "canActivate": true,
  "activationStatus": "replayed",
  "reason": null
}
```

Rejected activation (`200` business result):

```json
{
  "valid": false,
  "canActivate": false,
  "activationStatus": "rejected",
  "reason": "max_uses_exceeded"
}
```

## Outbound event: `license.issued`

Delivery target: `vendor_license_integrations.webhook_url`

Payload:

```json
{
  "eventId": "uuid",
  "eventType": "license.issued",
  "occurredAt": "ISO-8601",
  "purchaseId": "uuid",
  "productId": "uuid",
  "licenseKey": "string",
  "buyerRef": "uuid"
}
```

Headers:

- `x-kode01-signature: sha256=<hex>`
- `x-kode01-event-id`
- `x-kode01-event-type`

## Standard error payload

Errors return:

```json
{
  "error": "message"
}
```

Status code conventions:

- `400` request validation failure
- `401` missing/invalid auth
- `403` forbidden or integration disabled
- `404` product not found
- `429` rate limited
- `500` internal error
