# Endpoint AuthZ/Rate-Limit Matrix

| Endpoint Prefix | Auth | Role | MFA | CSRF | Rate Limit |
|---|---|---|---|---|---|
| `/api/admin/*` | Required | Admin | Required | Required | Global + endpoint |
| `/api/vendor/order-incidents/*` | Required | Seller | No | Required | Global + endpoint |
| `/api/vendor/products/*/license` | Required | Seller | No | Required | Global + endpoint |
| `/api/stripe/connect/*` | Required | Seller | No | Required | `STRIPE_CHECKOUT` |
| `/api/stripe/checkout` | Required | Signed-in user | No | Required | `STRIPE_CHECKOUT` |
| `/api/cart/checkout` | Required | Signed-in user | No | Required | `STRIPE_CHECKOUT` |
| `/api/download/:product_id` | Required | Buyer ownership | No | Required | Global + endpoint |
| `/api/webhooks/stripe-connect-thin` | Signature | N/A | N/A | Exempt | `WEBHOOK_REPLAY` |

Versioned source of truth: `config/security/security-contract.v1.json`

