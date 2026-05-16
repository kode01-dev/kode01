'use client';

import { useEffect, useState } from 'react';

type EndpointRow = {
  endpoint: string;
  requests: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  error_rate_percent: number;
};

type PerfSummary = {
  overview: {
    requests: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    error_rate_percent: number;
  };
  endpoints: EndpointRow[];
  db: {
    database?: {
      blks_read?: number;
      blks_hit?: number;
      cache_hit_ratio_percent?: number;
    };
  } | null;
};

export default function AdminPerformancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PerfSummary | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch('/api/admin/performance/summary', { method: 'GET' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json() as { data?: PerfSummary };
        setSummary(payload.data ?? null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="text-3xl font-serif font-black text-kode01-noir">Performance Dashboard</h1>
      <p className="mt-2 text-sm text-kode01-noir/60">p50/p95/p99 API + DB cache-hit + error-rate.</p>

      {loading ? <p className="mt-8 text-sm text-kode01-noir/60">Loading...</p> : null}
      {error ? <p className="mt-8 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && summary ? (
        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">Requests</p>
              <p className="mt-2 text-2xl font-black text-kode01-noir">{summary.overview.requests}</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">p50</p>
              <p className="mt-2 text-2xl font-black text-kode01-noir">{summary.overview.p50_ms}ms</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">p95</p>
              <p className="mt-2 text-2xl font-black text-kode01-noir">{summary.overview.p95_ms}ms</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">p99</p>
              <p className="mt-2 text-2xl font-black text-kode01-noir">{summary.overview.p99_ms}ms</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">Error Rate</p>
              <p className="mt-2 text-2xl font-black text-kode01-noir">{summary.overview.error_rate_percent}%</p>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">DB Cache Hit</p>
            <p className="mt-2 text-2xl font-black text-kode01-noir">
              {summary.db?.database?.cache_hit_ratio_percent ?? 0}%
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-kode01-noir/45">Endpoints</h2>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10">
                    <th className="px-2 py-2 font-bold">Endpoint</th>
                    <th className="px-2 py-2 font-bold">Requests</th>
                    <th className="px-2 py-2 font-bold">p50</th>
                    <th className="px-2 py-2 font-bold">p95</th>
                    <th className="px-2 py-2 font-bold">p99</th>
                    <th className="px-2 py-2 font-bold">Error %</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.endpoints.map((row) => (
                    <tr key={row.endpoint} className="border-b border-black/5">
                      <td className="px-2 py-2">{row.endpoint}</td>
                      <td className="px-2 py-2">{row.requests}</td>
                      <td className="px-2 py-2">{row.p50_ms}ms</td>
                      <td className="px-2 py-2">{row.p95_ms}ms</td>
                      <td className="px-2 py-2">{row.p99_ms}ms</td>
                      <td className="px-2 py-2">{row.error_rate_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
