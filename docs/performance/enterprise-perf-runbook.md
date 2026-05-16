# Enterprise Performance Runbook

## SLO Targets
- `p95 API` < `200ms`
- `TTFB listing pages` < `300ms`
- `error rate` < `1%`
- `Disk IO budget depletion` = `0 incidents`

## Primary KPIs
- API latency: `p50/p95/p99` by endpoint
- DB I/O: `shared_blks_read`, `blk_read_time`, `cache hit ratio`
- Infra saturation: CPU, RAM, swap, disk throughput/IOPS
- User UX: Web Vitals (`TTFB`, `INP`, `LCP`)

## Incident Triage (High Disk I/O)
1. Confirm incident window and impacted endpoints.
2. Check Supabase `Disk IO Budget` and `Database Health`.
3. Identify top read-heavy queries in `pg_stat_statements`.
4. Validate index usage with `EXPLAIN (ANALYZE, BUFFERS)`.
5. Check cache effectiveness (`shared_blks_hit` vs `shared_blks_read`).
6. Mitigate:
   - Disable expensive counts/facets in append paths.
   - Increase cache TTL to `120s` temporarily for public list endpoints.
   - Switch to pre-aggregated tables/RPC.
   - Upgrade compute if budget still depletes.

## Emergency Mitigations
- Market append mode:
  - `includeFacets=false`
  - `includeTotal=false`
- Temporarily reduce listing page-size from `24` to `16`.
- Route recommendations to global precompute only (disable personalization fetch).

## Post-Incident
1. Record root cause and impacted time window.
2. Add missing index / query rewrite / cache policy change.
3. Re-run load test (`scripts/perf/load-test.mjs`).
4. Enforce perf gate (`scripts/perf/check-perf-gate.mjs`).
