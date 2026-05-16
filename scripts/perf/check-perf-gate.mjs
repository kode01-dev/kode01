import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPORT_PATH = process.env.PERF_REPORT_PATH ?? path.join(process.cwd(), 'tmp', 'perf-report.json');
const SLO_PATH = process.env.PERF_SLO_PATH ?? path.join(process.cwd(), 'config', 'performance', 'slo-contracts.json');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

export function normalizeEndpointToPathname(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    return '';
  }

  try {
    return new URL(endpoint, 'http://localhost').pathname;
  } catch {
    return endpoint;
  }
}

function getEndpointRows(report) {
  if (Array.isArray(report.endpoints)) {
    return report.endpoints;
  }

  if (!Array.isArray(report.scenarios)) {
    return [];
  }

  return report.scenarios.map((scenario) => {
    const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
    const totalRequests = steps.reduce((total, step) => total + Number(step.totalRequests ?? 0), 0);
    const failures = steps.reduce((total, step) => total + Number(step.failures ?? 0), 0);
    const p95Ms = Math.max(0, ...steps.map((step) => Number(step.p95 ?? step.p95Ms ?? 0)));

    return {
      endpoint: scenario.endpoint,
      p95Ms,
      errorRatePercent: Number(((failures / Math.max(1, totalRequests)) * 100).toFixed(2)),
    };
  });
}

export async function main() {
  const [reportRaw, sloRaw] = await Promise.all([
    fs.readFile(REPORT_PATH, 'utf8'),
    fs.readFile(SLO_PATH, 'utf8'),
  ]);

  const report = JSON.parse(reportRaw);
  const slo = JSON.parse(sloRaw);
  const endpointSlo = slo.endpoints ?? {};
  const defaultP95 = Number(slo.global?.api_p95_ms ?? 200);
  const defaultErrorRate = Number(slo.global?.error_rate_percent ?? 1);

  const rows = getEndpointRows(report);
  if (rows.length === 0) {
    fail('Performance report has no endpoints to evaluate.');
    return;
  }

  let hasFailure = false;
  for (const row of rows) {
    const endpointPathname = normalizeEndpointToPathname(row.endpoint);
    const contract = endpointSlo[endpointPathname] ?? endpointSlo[row.endpoint] ?? {};
    const maxP95 = Number(contract.p95_ms ?? defaultP95);
    const maxErrorRate = Number(contract.error_rate_percent ?? defaultErrorRate);

    if (Number(row.p95Ms) > maxP95) {
      hasFailure = true;
      fail(`SLO breach: ${row.endpoint} p95=${row.p95Ms}ms > ${maxP95}ms`);
    }
    if (Number(row.errorRatePercent) > maxErrorRate) {
      hasFailure = true;
      fail(`SLO breach: ${row.endpoint} error_rate=${row.errorRatePercent}% > ${maxErrorRate}%`);
    }
  }

  if (!hasFailure) {
    console.log('Performance gate passed.');
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string'
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    const message = error instanceof Error
      ? (error.stack ?? error.message)
      : String(error);
    fail(message);
  });
}
