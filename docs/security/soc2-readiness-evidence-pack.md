# SOC 2 Readiness Evidence Pack

## Current Evidence Snapshot
- Date: 2026-05-12
- Scope: Next.js app, API routes, Supabase RLS/migrations, Vercel runtime configuration, dependency posture.
- Dependency remediation applied:
  - `next` upgraded to `16.2.6`
  - `eslint-config-next` upgraded to `16.2.6`
  - `next-intl` upgraded to `4.11.2`
  - Transitive npm advisory fixes applied through `npm audit fix`
  - Unused JS LangChain runtime packages removed from the Next.js app
  - `resend` pinned to `6.1.3` to avoid the vulnerable `svix`/`uuid` chain
  - Targeted npm overrides applied for vulnerable transitive `postcss`, `lodash`, `lodash-es`, and `picomatch`
- Current `npm audit --omit=dev --json` result after remediation:
  - Critical: 0
  - High: 0
  - Moderate: 0
  - Low: 0

## Control Evidence
- Endpoint security contract: `config/security/security-contract.v1.json`
- Security baseline: `docs/security/security-baseline-2026-04-13.md`
- Endpoint matrix: `docs/security/endpoint-authz-rate-limit-matrix.md`
- RLS privilege hardening: `supabase/migrations/20260812000000_harden_profiles_admin_role_changes.sql`
- Runtime secret enforcement: `src/lib/env/server.ts`
- Audit log integrity: `src/lib/security/security-log.ts`
- Cron/internal auth: `src/lib/security/cron-auth.ts`, `src/lib/security/internal-auth.ts`
- Session policy: `docs/security/session-policy.md`
- Backup policy: `docs/security/backup-policy.md`
- Incident response: `docs/security/incident-response.md`
- Vulnerability management: `docs/security/vulnerability-management.md`

## MFA Launch Decision
- Launch policy: MFA is mandatory for admins only.
- Seller/user MFA: optional and planned for a later progressive rollout to avoid onboarding and checkout friction.
- Compensating controls for seller-sensitive actions:
  - Session authentication and seller role checks
  - Ownership checks on seller-scoped resources
  - CSRF validation on mutating session-bound requests
  - Global and endpoint rate limiting
  - Supabase RLS and server-side service-role boundaries
  - Audit logging for sensitive operational events
  - Stripe signature/state validation where applicable

## Residual Vulnerability Register
| Package path | Severity | Reason not force-fixed | Required follow-up |
|---|---:|---|---|
| None after `npm audit --omit=dev` and `npm audit --audit-level=high` | - | No production advisories and no high/critical dependency advisories remain after the current remediation pass. | Re-run both audit gates weekly, after each framework upgrade, and before production release. |

## Secret Rotation Checklist
- Treat every `.env*`, `*_env*.txt`, `s_sec*.txt`, and `modal_secrets.env` local file as sensitive and excluded from audit exports.
- Rotate these if any local file was shared, uploaded, pasted into tools, or exposed in logs:
  - Supabase service role key and database password
  - Stripe secret key and webhook secrets
  - Cron and internal auth tokens, including `_NEXT` rotation slots
  - AI provider keys and GitHub/HuggingFace tokens
  - Email provider API keys
  - `AUDIT_LOG_INTEGRITY_SECRET`
- Record rotation evidence with key ID, owner, rotated-at timestamp, and deployment confirmation.

## Preproduction Acceptance Checks
- Admin without MFA is blocked from admin pages and `/api/admin/*`.
- Seller without MFA is not blocked by MFA middleware on payout, order incident, coupon, Stripe Connect, or license-sensitive routes, but remains subject to auth, role, ownership, CSRF, RLS, audit, and rate-limit controls.
- Stripe webhooks reject missing or invalid signatures.
- Cron routes reject unsigned or expired requests.
- Supabase auth cookies in production are `HttpOnly`, `Secure`, `SameSite=Lax` or stricter.
- CSP report-only telemetry is reviewed before setting inline script/style allowances to false.

## Migration Chronology Note
Some migration filenames are future-dated relative to 2026-04-26. For SOC 2 evidence, use Git commit timestamps, Supabase migration application logs, and deployment records as authoritative implementation dates. Treat migration filenames only as ordering identifiers. Run `npm run check:migrations` to report future-dated filenames without mutating migration history.
