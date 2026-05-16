# Critical Dependency Outage Runbook

## Scope
- Supabase Edge Functions
- Stripe / SendFox / Firecrawl / LLM providers
- Modal runtime API

## Detection
1. Check `cron.failed` spikes and `CRON_EXECUTION_FAILED` responses.
2. Check `/internal/slo` queue age/dead-letter growth.
3. Check provider dashboards and status pages.

## Immediate Actions
1. Freeze non-essential manual triggers from admin.
2. Keep security-critical flows fail-closed (no auth/payment bypass).
3. Route async workloads to queue-only behavior if upstream is unstable.

## Stabilization
1. Confirm retries and dead-letter capture are active.
2. Replay only after dependency health is stable.
3. Monitor error-rate and backlog until below SLO thresholds.

## Exit Criteria
- No sustained `CRON_EXECUTION_FAILED` bursts.
- Queue oldest pending age back under target SLO.
- Replay queue drained without duplicate side effects.
