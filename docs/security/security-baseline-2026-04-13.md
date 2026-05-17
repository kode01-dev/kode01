# Security Baseline - 2026-04-13

## Scope
- Web application and API security controls for KODE01 marketplace.
- Source of truth for endpoint controls: `config/security/security-contract.v1.json`.

## Enforced Controls
- Request diagnostics headers set in middleware:
  - `x-request-id`
  - `x-security-contract-version`
- HTTP security headers:
  - `Strict-Transport-Security`
  - `X-Frame-Options=DENY`
  - `X-Content-Type-Options=nosniff`
  - CSP enforced policy + stricter CSP `Report-Only` policy for migration off `unsafe-inline`
- CSRF enforcement for mutating API/server actions (excluding webhook/cron exemptions).
- CSRF webhook/cron exemptions are exact-path allowlist entries; new prefixed routes are not exempt until explicitly reviewed.
- Global and endpoint rate limiting with security logging.
- Bot blocking middleware and security event logging.
- Admin MFA gating for admin pages and APIs.
- Seller/vendor MFA is not required at launch; seller financial-sensitive APIs keep session auth, role checks, ownership checks, CSRF, rate limiting, RLS, and audit logging as compensating controls.
- Stripe webhook signature verification and replay idempotency lock.
- Product downloads require buyer ownership, endpoint rate limiting, signed URLs, and fail-closed vault path validation before Supabase Storage signing. Legacy rows with invalid vault paths must be corrected by re-upload or database cleanup.

## Session Policy
- Explicit cookie policy for Supabase SSR sessions:
  - `Secure` in production
  - `SameSite=Lax`
  - `HttpOnly` for server-set auth cookies
  - `path=/`
  - shared domain on `*.kode01.com`
- Session timeout controls remain defined in `supabase/config.toml`.

## Compliance Evidence Anchors
- DSR export events:
  - `account_export_requested`
  - `account_export_succeeded`
  - `account_export_failed`
- DSR deletion events:
  - `account_deletion_requested`
  - `account_deleted`
  - `account_profile_cleanup_failed`

## Dynamic Validation Checklist (Preproduction)
- Confirm CSP report telemetry before disabling inline script/style allowances:
  - `CSP_ALLOW_UNSAFE_INLINE_SCRIPT=false`
  - `CSP_ALLOW_UNSAFE_INLINE_STYLE=false`
- Confirm `sb-*-auth-token` flags in browser devtools response headers:
  - `HttpOnly`, `Secure`, `SameSite=Lax|Strict`.
- Confirm direct access to Supabase Edge Functions fails without internal token.
- Confirm seller routes are not MFA-blocked at launch but still enforce auth/role/ownership:
  - `/api/stripe/connect/*`
  - `/api/vendor/products/*/license`
  - `/api/vendor/order-incidents/*`
