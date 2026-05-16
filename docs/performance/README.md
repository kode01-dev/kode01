# Performance Operations

## SLO Contract
- Source of truth: `config/performance/slo-contracts.json`

## Load Test
1. Start app locally:
   - `npm run dev`
2. Run benchmark:
   - `node scripts/perf/load-test.mjs`
3. Output:
   - `tmp/perf-report.json`

## Perf Gate
- Validate report against SLO contracts:
  - `node scripts/perf/check-perf-gate.mjs`

## Optional env vars
- `PERF_BASE_URL` (default: `http://localhost:3000`)
- `PERF_REQUESTS` (default: `120`)
- `PERF_CONCURRENCY` (default: `8`)
- `PERF_OUT` (default: `tmp/perf-report.json`)
- `PERF_REPORT_PATH` (default: `tmp/perf-report.json`)
- `PERF_SLO_PATH` (default: `config/performance/slo-contracts.json`)
