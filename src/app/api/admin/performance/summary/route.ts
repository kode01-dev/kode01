import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSessionOrNull } from '@/app/api/admin/api-monitoring/_lib';

type PerfEventRow = {
  endpoint: string;
  success: boolean;
  duration_ms: number;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return Math.round(sorted[idx] ?? 0);
}

async function readSloContracts() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'config', 'performance', 'slo-contracts.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const adminSession = await getAdminSessionOrNull(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    const [sloContracts, perfSnapshotResult, apiEventsResult] = await Promise.all([
      readSloContracts(),
      admin.rpc('get_perf_observability_snapshot'),
      admin
        .from('external_api_call_events')
        .select('endpoint, success, duration_ms')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000),
    ]);

    if (apiEventsResult.error) {
      return NextResponse.json({ error: 'Failed to load API monitoring rows' }, { status: 500 });
    }
    if (perfSnapshotResult.error) {
      return NextResponse.json({ error: 'Failed to load DB observability snapshot' }, { status: 500 });
    }

    const rows = (apiEventsResult.data ?? []) as PerfEventRow[];
    const allDurations = rows.map((row) => Number(row.duration_ms)).filter((value) => Number.isFinite(value) && value >= 0);
    const totalCalls = rows.length;
    const failures = rows.filter((row) => !row.success).length;

    const byEndpoint = Array.from(new Set(rows.map((row) => row.endpoint))).map((endpoint) => {
      const endpointRows = rows.filter((row) => row.endpoint === endpoint);
      const endpointDurations = endpointRows
        .map((row) => Number(row.duration_ms))
        .filter((value) => Number.isFinite(value) && value >= 0);
      const endpointFailures = endpointRows.filter((row) => !row.success).length;
      return {
        endpoint,
        requests: endpointRows.length,
        p50_ms: percentile(endpointDurations, 0.5),
        p95_ms: percentile(endpointDurations, 0.95),
        p99_ms: percentile(endpointDurations, 0.99),
        error_rate_percent: Number(((endpointFailures / Math.max(1, endpointRows.length)) * 100).toFixed(2)),
      };
    });

    return NextResponse.json({
      data: {
        range: '24h',
        generated_at: new Date().toISOString(),
        slo_contracts: sloContracts,
        overview: {
          requests: totalCalls,
          p50_ms: percentile(allDurations, 0.5),
          p95_ms: percentile(allDurations, 0.95),
          p99_ms: percentile(allDurations, 0.99),
          error_rate_percent: Number(((failures / Math.max(1, totalCalls)) * 100).toFixed(2)),
        },
        endpoints: byEndpoint,
        db: perfSnapshotResult.data,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/performance/summary error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
