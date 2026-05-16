# SOC 2 Security Hardening Evidence Map

## Scope
This document maps implemented security hardening controls to SOC 2 criteria for evidence collection.

## Control Mapping
- CC6.1 / CC8.1: CSRF exemption scope reduced to explicit allowlist.
  - Evidence:
    - `src/lib/security/csrf-exemptions.ts`
    - `src/proxy.ts`
    - `tests/features/csrf-exemptions.test.ts`

- CC6.1 / CC6.3: Privileged role assignment hardening (`profiles.role` admin transitions blocked for untrusted clients).
  - Evidence:
    - `supabase/migrations/20260812000000_harden_profiles_admin_role_changes.sql`

- CC4.1 / CC7.2: Audit pipeline durability and detection.
  - Evidence:
    - `src/lib/security/security-log.ts` (retry + in-memory queue + structured fallback sink + failure-rate alert)
    - `src/app/api/cron/api-monitor-health/route.ts` (audit delivery metrics exposure)
    - `tests/features/security-log-durability.test.ts`

- CC7.1: Degraded rate-limit operations hardening.
  - Evidence:
    - `src/lib/security/rate-limiter.ts` (in-memory degraded fallback + degraded alert)
    - `tests/features/rate-limiter-fallback.test.ts`

- CC6.1: Secrets/integrity config enforcement at startup.
  - Evidence:
    - `src/lib/env/server.ts` (`AUDIT_LOG_INTEGRITY_SECRET` required in production)
    - `tests/features/server-env-security.test.ts`

- CC6.1 / CC7.2: Cron endpoint spoofing hardening.
  - Evidence:
    - `src/lib/security/cron-auth.ts` (signed HMAC request verification + strict bearer/JWT validation path)
    - `tests/features/cron-auth.test.ts`

## Runbook Linkage
- Dependency outage and response procedures:
  - `docs/runbooks/critical-dependency-outage.md`

## Notes for Audit Package
- Attach CI test output for the security test files listed above.
- Attach migration apply logs for the role-hardening migration.
- Attach log excerpts showing:
  - `security.audit_insertion_failure_rate_alert`
  - `security.audit_insert_fallback_queued`
  - `security.rate_limit_backend_degraded`
