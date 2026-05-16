# Runtime Rollback Runbook (Execution Mode)

## Trigger
- New runtime behavior causes repeated failures or duplicate side effects.

## Steps
1. Set `AGENT_EXECUTION_MODE=vercel` to isolate queue runtime path.
2. Keep `MODAL_AGENT_API_URL` and internal auth tokens in place for diagnostics.
3. Re-deploy web app and confirm cron endpoints return healthy responses.
4. Pause Modal cron schedules if duplicate triggers are suspected.

## Post-Rollback Checks
1. Validate critical cron flows (`weekly-ai-recap`, `send-emails`).
2. Check auth failures and queue health metrics.
3. Confirm no pending replay backlog for critical jobs.

## Return-to-Service
1. Fix root cause.
2. Re-enable `AGENT_EXECUTION_MODE=modal` with staged verification.
3. Monitor duplicate execution and dead-letter rates for one full schedule cycle.
