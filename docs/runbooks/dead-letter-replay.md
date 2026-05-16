# Dead-Letter Replay Runbook (Modal Agent Runtime)

## Preconditions
- Upstream dependency outage is resolved.
- Replay scope and job IDs are approved by on-call owner.

## Steps
1. Inspect queue health via `GET /internal/slo`.
2. Identify failed job IDs from job status API/logs.
3. Replay each job with:
   - `POST /internal/jobs/:jobId/replay`
4. Track replayed job status until terminal state.

## Safety Rules
- Replay only jobs in `dead_letter` state.
- Replay in batches to avoid upstream thundering herd.
- Stop replay if failure rate spikes again.

## Verification
1. Validate side effects (newsletter/webhook/resource sync) occurred once.
2. Ensure queue backlog returns to normal thresholds.
3. Record replayed job IDs in incident notes.
