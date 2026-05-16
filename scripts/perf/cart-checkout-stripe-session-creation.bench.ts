import { performance } from 'node:perf_hooks';

type SellerCheckoutRequest = {
  sellerId: string;
  itemCount: number;
  subtotalCents: number;
  cartItemIds: string;
};

const SELLER_COUNT = 8;
const NETWORK_DELAY_MS = 120;
const ITERATIONS = 12;
const WARMUP_ITERATIONS = 2;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createFixture(): SellerCheckoutRequest[] {
  return Array.from({ length: SELLER_COUNT }, (_, index) => ({
    sellerId: `seller-${index + 1}`,
    itemCount: 3,
    subtotalCents: 4_999,
    cartItemIds: `cart-item-${index + 1}-a,cart-item-${index + 1}-b,cart-item-${index + 1}-c`,
  }));
}

async function mockStripeSessionCreate(input: SellerCheckoutRequest) {
  await delay(NETWORK_DELAY_MS);
  return {
    id: `cs_${input.sellerId}`,
    url: `https://checkout.example.test/${input.sellerId}`,
  };
}

async function createSessionsSequential(requests: SellerCheckoutRequest[]) {
  const sessions: Array<{ sellerId: string; checkoutSessionId: string; checkoutUrl: string }> = [];
  for (const request of requests) {
    const session = await mockStripeSessionCreate(request);
    sessions.push({
      sellerId: request.sellerId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  }
  return sessions;
}

async function createSessionsConcurrent(requests: SellerCheckoutRequest[]) {
  return Promise.all(
    requests.map(async (request) => {
      const session = await mockStripeSessionCreate(request);
      return {
        sellerId: request.sellerId,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
      };
    }),
  );
}

async function runCase(args: {
  name: string;
  execute: (requests: SellerCheckoutRequest[]) => Promise<unknown>;
}) {
  const requests = createFixture();
  const durationsMs: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS + WARMUP_ITERATIONS; iteration += 1) {
    const startedAt = performance.now();
    await args.execute(requests);
    const durationMs = performance.now() - startedAt;

    if (iteration >= WARMUP_ITERATIONS) {
      durationsMs.push(durationMs);
    }
  }

  const averageMs = durationsMs.reduce((total, value) => total + value, 0) / durationsMs.length;
  return {
    name: args.name,
    avgMs: Number(averageMs.toFixed(2)),
    minMs: Number(Math.min(...durationsMs).toFixed(2)),
    maxMs: Number(Math.max(...durationsMs).toFixed(2)),
  };
}

async function main() {
  const baseline = await runCase({
    name: 'baseline_sequential',
    execute: createSessionsSequential,
  });
  const optimized = await runCase({
    name: 'optimized_concurrent_promise_all',
    execute: createSessionsConcurrent,
  });

  const improvementMs = baseline.avgMs - optimized.avgMs;
  const improvementPct = (improvementMs / baseline.avgMs) * 100;

  console.log(JSON.stringify({ sellerCount: SELLER_COUNT, networkDelayMs: NETWORK_DELAY_MS, iterations: ITERATIONS }));
  console.log(JSON.stringify(baseline));
  console.log(JSON.stringify(optimized));
  console.log(
    JSON.stringify({
      name: 'delta',
      improvementMs: Number(improvementMs.toFixed(2)),
      improvementPct: Number(improvementPct.toFixed(2)),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
