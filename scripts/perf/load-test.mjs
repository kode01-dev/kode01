import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * API performance smoke/load test for Kode01.
 * Defaults are intentionally small so local and CI runs cannot accidentally overload the app.
 */

const BASE_URL = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT_DIR = path.join(process.cwd(), 'tmp');
const JSON_REPORT = path.join(OUT_DIR, 'perf-report.json');
const MD_REPORT = path.join(OUT_DIR, 'perf-report.md');
const DEFAULT_REQUESTS_PER_STEP = parsePositiveInteger(process.env.PERF_REQUESTS, 30);
const DEFAULT_CONCURRENCY = parseConcurrency(process.env.PERF_CONCURRENCY, [4]);
const REQUEST_TIMEOUT_MS = parsePositiveInteger(process.env.PERF_REQUEST_TIMEOUT_MS, 15000);

const SCENARIOS = [
  {
    name: 'Market Discovery',
    endpoint: '/api/market/list?locale=en&limit=24',
    concurrency: DEFAULT_CONCURRENCY,
    requestsPerStep: DEFAULT_REQUESTS_PER_STEP,
  },
  {
    name: 'Market Search',
    endpoint: '/api/market/list?locale=en&q=blueprint',
    concurrency: DEFAULT_CONCURRENCY,
    requestsPerStep: DEFAULT_REQUESTS_PER_STEP,
  },
  {
    name: 'Blog/News Feed',
    endpoint: '/api/news/list?locale=en&limit=10',
    concurrency: DEFAULT_CONCURRENCY,
    requestsPerStep: DEFAULT_REQUESTS_PER_STEP,
  },
];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseConcurrency(value, fallback) {
  if (!value) return fallback;
  const parsed = String(value)
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return Math.round(sorted[idx] ?? 0);
}

async function timedFetch(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.arrayBuffer();
    const ended = performance.now();
    return { ok: response.ok, status: response.status, duration: ended - started };
  } catch (err) {
    const ended = performance.now();
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, duration: ended - started, error: message };
  }
}

async function runScenarioStep(endpoint, concurrency, totalRequests) {
  const url = `${BASE_URL}${endpoint}`;
  const results = [];
  let completed = 0;

  console.log(`  [Step] Concurrency: ${concurrency}, Requests: ${totalRequests}`);

  const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, async () => {
    while (completed < totalRequests) {
      completed += 1;
      results.push(await timedFetch(url));
    }
  });

  await Promise.all(workers);

  const durations = results.map((result) => result.duration);
  const failures = results.filter((result) => !result.ok).length;

  return {
    concurrency,
    totalRequests: results.length,
    failures,
    errorRate: Number(((failures / Math.max(1, results.length)) * 100).toFixed(2)),
    avg: Math.round(durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length)),
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  };
}

function summarizeEndpoint(scenario) {
  const totalRequests = scenario.steps.reduce((total, step) => total + step.totalRequests, 0);
  const failures = scenario.steps.reduce((total, step) => total + step.failures, 0);
  const weightedAvg = scenario.steps.reduce(
    (total, step) => total + (step.avg * step.totalRequests),
    0,
  ) / Math.max(1, totalRequests);

  return {
    name: scenario.name,
    endpoint: scenario.endpoint,
    requests: totalRequests,
    failures,
    errorRatePercent: Number(((failures / Math.max(1, totalRequests)) * 100).toFixed(2)),
    avgMs: Math.round(weightedAvg),
    p95Ms: Math.max(...scenario.steps.map((step) => step.p95)),
    p99Ms: Math.max(...scenario.steps.map((step) => step.p99)),
  };
}

async function main() {
  console.log(`Starting API performance test on ${BASE_URL}`);
  const startTime = new Date();
  const scenarioResults = [];

  for (const scenario of SCENARIOS) {
    console.log(`\nRunning Scenario: ${scenario.name}`);
    const steps = [];
    for (const concurrency of scenario.concurrency) {
      steps.push(await runScenarioStep(scenario.endpoint, concurrency, scenario.requestsPerStep));
    }
    scenarioResults.push({ name: scenario.name, endpoint: scenario.endpoint, steps });
  }

  const endTime = new Date();
  const endpoints = scenarioResults.map(summarizeEndpoint);
  const report = {
    testInfo: {
      baseUrl: BASE_URL,
      startTime,
      endTime,
      durationSec: (endTime - startTime) / 1000,
      requestsPerStep: DEFAULT_REQUESTS_PER_STEP,
      concurrency: DEFAULT_CONCURRENCY,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    },
    endpoints,
    scenarios: scenarioResults,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(JSON_REPORT, JSON.stringify(report, null, 2));

  let md = `# API Performance Report - ${startTime.toLocaleDateString()}\n\n`;
  md += `**Target:** ${BASE_URL}\n`;
  md += `**Duration:** ${report.testInfo.durationSec.toFixed(2)}s\n`;
  md += `**Requests per step:** ${DEFAULT_REQUESTS_PER_STEP}\n`;
  md += `**Concurrency:** ${DEFAULT_CONCURRENCY.join(', ')}\n\n`;

  for (const s of scenarioResults) {
    md += `### ${s.name}\n`;
    md += `\`${s.endpoint}\`\n\n`;
    md += `| Concurrency | Requests | Failures | Error % | Avg (ms) | P95 (ms) | P99 (ms) |\n`;
    md += `|-------------|----------|----------|---------|----------|----------|----------|\n`;
    for (const step of s.steps) {
      md += `| ${step.concurrency} | ${step.totalRequests} | ${step.failures} | ${step.errorRate}% | ${step.avg} | ${step.p95} | ${step.p99} |\n`;
    }
    md += `\n`;
  }

  await fs.writeFile(MD_REPORT, md);
  console.log(`\nReports generated:`);
  console.log(`- JSON: ${JSON_REPORT}`);
  console.log(`- Markdown: ${MD_REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
