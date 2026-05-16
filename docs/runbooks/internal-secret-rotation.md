# Internal Secret Rotation Runbook

## Secrets
- `AGENT_INTERNAL_TOKEN` / `AGENT_INTERNAL_TOKEN_NEXT`
- `CRON_SECRET` / `CRON_SECRET_NEXT`
- `EDGE_INTERNAL_AUTH_TOKEN` / `EDGE_INTERNAL_AUTH_TOKEN_NEXT`

## Rotation Procedure
1. Generate new secret value and set it in `*_NEXT`.
2. Deploy all services with both active + next configured.
3. Validate health and auth success rates for 24h.
4. Promote next secret into active secret variable.
5. Generate a new next secret and repeat cycle.

## Validation
1. Call Modal runtime internal auth-protected endpoints with current client.
2. Confirm no rise in `INTERNAL_AUTH_INVALID` and `CRON_UNAUTHORIZED`.
3. Confirm scheduled cron execution still succeeds.

## Rollback
1. Restore previous active secret value immediately.
2. Clear invalid next secret.
3. Re-deploy and recheck auth/error telemetry.
