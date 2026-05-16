import { performance } from 'node:perf_hooks';

type ProductRow = {
  id: string;
  seller_id: string;
  generates_license_key: boolean;
};

type BenchSummary = {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  samplesMs: number[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(samples: number[]): BenchSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (percentile: number) => {
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentile));
    return sorted[index] ?? 0;
  };
  const total = sorted.reduce((acc, value) => acc + value, 0);

  return {
    avgMs: total / sorted.length,
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    samplesMs: sorted,
  };
}

async function runSamples(task: () => Promise<void>, iterations: number): Promise<BenchSummary> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    await task();
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

async function run(): Promise<void> {
  const products: ProductRow[] = Array.from({ length: 8 }, (_, index) => ({
    id: `product-${index + 1}`,
    seller_id: `seller-${index + 1}`,
    generates_license_key: true,
  }));

  const resolveOrCreateBundleDerivedPurchase = async () => {
    await sleep(20);
  };

  const resolveOrCreateLicenseKey = async () => {
    await sleep(15);
  };

  const sequential = async () => {
    for (let index = 0; index < products.length; index += 1) {
      await resolveOrCreateBundleDerivedPurchase();
      await resolveOrCreateLicenseKey();
    }
  };

  const concurrent = async () => {
    await Promise.all(
      products.map(async () => {
        await resolveOrCreateBundleDerivedPurchase();
        await resolveOrCreateLicenseKey();
      }),
    );
  };

  const iterations = 8;
  const baseline = await runSamples(sequential, iterations);
  const optimized = await runSamples(concurrent, iterations);

  const deltaMs = baseline.avgMs - optimized.avgMs;
  const speedup = baseline.avgMs / optimized.avgMs;
  const improvementPct = (deltaMs / baseline.avgMs) * 100;

  const result = {
    config: {
      iterations,
      products: products.length,
      purchaseResolveDelayMs: 20,
      licenseResolveDelayMs: 15,
    },
    baselineSequential: baseline,
    optimizedConcurrent: optimized,
    deltaMs,
    speedupX: speedup,
    improvementPct,
  };

  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exitCode = 1;
});
