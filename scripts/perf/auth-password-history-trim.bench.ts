import { performance } from 'node:perf_hooks';

type PasswordHistoryIdRow = {
  id: string;
};

type QueryCounters = {
  selects: number;
  deletes: number;
  deletedRows: number;
};

const PASSWORD_HISTORY_LIMIT = 5;
const DELETE_BATCH_SIZE = 200;
const MAX_DELETE_BATCHES = 20;
const MAX_STALE_ROWS = DELETE_BATCH_SIZE * MAX_DELETE_BATCHES;
const SIMULATED_QUERY_LATENCY_MS = 2;
const ITERATIONS = 30;
const WARMUP_ITERATIONS = 5;

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildStaleIds(staleRowCount: number) {
  return Array.from({ length: staleRowCount }, (_, index) => `history-${index}`);
}

class SimulatedPasswordHistoryTable {
  staleIds: string[];
  counters: QueryCounters = {
    selects: 0,
    deletes: 0,
    deletedRows: 0,
  };

  constructor(staleRowCount: number) {
    this.staleIds = buildStaleIds(staleRowCount);
  }

  async selectStaleRange(from: number, to: number): Promise<PasswordHistoryIdRow[]> {
    this.counters.selects += 1;
    await sleep(SIMULATED_QUERY_LATENCY_MS);

    const staleFrom = Math.max(0, from - PASSWORD_HISTORY_LIMIT);
    const staleTo = Math.max(-1, to - PASSWORD_HISTORY_LIMIT);
    return this.staleIds.slice(staleFrom, staleTo + 1).map((id) => ({ id }));
  }

  async deleteIds(ids: string[]): Promise<void> {
    this.counters.deletes += 1;
    await sleep(SIMULATED_QUERY_LATENCY_MS);

    const idsToDelete = new Set(ids);
    this.staleIds = this.staleIds.filter((id) => !idsToDelete.has(id));
    this.counters.deletedRows += ids.length;
  }
}

async function trimPasswordHistoryCurrentLoop(table: SimulatedPasswordHistoryTable) {
  for (let iteration = 0; iteration < MAX_DELETE_BATCHES; iteration += 1) {
    const data = await table.selectStaleRange(
      PASSWORD_HISTORY_LIMIT,
      PASSWORD_HISTORY_LIMIT + DELETE_BATCH_SIZE - 1,
    );
    const staleIds = data.map((row) => row.id);

    if (staleIds.length === 0) return;

    await table.deleteIds(staleIds);

    if (staleIds.length < DELETE_BATCH_SIZE) return;
  }

  throw new Error('Password history trim exceeded safe iteration limit');
}

async function trimPasswordHistorySingleRead(table: SimulatedPasswordHistoryTable) {
  const data = await table.selectStaleRange(
    PASSWORD_HISTORY_LIMIT,
    PASSWORD_HISTORY_LIMIT + MAX_STALE_ROWS - 1,
  );
  const staleIds = data.map((row) => row.id);

  if (staleIds.length === 0) return;

  for (let index = 0; index < staleIds.length; index += DELETE_BATCH_SIZE) {
    await table.deleteIds(staleIds.slice(index, index + DELETE_BATCH_SIZE));
  }

  if (staleIds.length >= MAX_STALE_ROWS) {
    throw new Error('Password history trim exceeded safe iteration limit');
  }
}

async function runCase(args: {
  name: string;
  staleRowCount: number;
  trim: (table: SimulatedPasswordHistoryTable) => Promise<void>;
}) {
  const durationsMs: number[] = [];
  let lastCounters: QueryCounters | null = null;

  for (let iteration = 0; iteration < ITERATIONS + WARMUP_ITERATIONS; iteration += 1) {
    const table = new SimulatedPasswordHistoryTable(args.staleRowCount);
    const startedAt = performance.now();
    await args.trim(table);
    const durationMs = performance.now() - startedAt;

    if (iteration >= WARMUP_ITERATIONS) {
      durationsMs.push(durationMs);
      lastCounters = table.counters;
    }
  }

  const avgMs = durationsMs.reduce((total, value) => total + value, 0) / durationsMs.length;

  return {
    name: args.name,
    staleRowCount: args.staleRowCount,
    avgMs: Number(avgMs.toFixed(2)),
    minMs: Number(Math.min(...durationsMs).toFixed(2)),
    maxMs: Number(Math.max(...durationsMs).toFixed(2)),
    counters: lastCounters,
  };
}

function printDelta(name: string, baselineMs: number, optimizedMs: number) {
  const improvementMs = baselineMs - optimizedMs;
  const improvementPct = (improvementMs / baselineMs) * 100;

  console.log(JSON.stringify({
    name,
    improvementMs: Number(improvementMs.toFixed(2)),
    improvementPct: Number(improvementPct.toFixed(2)),
  }));
}

async function benchmarkScenario(name: string, staleRowCount: number) {
  const currentLoop = await runCase({
    name: `${name}:current_loop`,
    staleRowCount,
    trim: trimPasswordHistoryCurrentLoop,
  });
  const singleRead = await runCase({
    name: `${name}:single_read`,
    staleRowCount,
    trim: trimPasswordHistorySingleRead,
  });

  console.log(JSON.stringify(currentLoop));
  console.log(JSON.stringify(singleRead));
  printDelta(`${name}:delta:single_read_vs_current_loop`, currentLoop.avgMs, singleRead.avgMs);
}

async function main() {
  await benchmarkScenario('no_stale_rows', 0);
  await benchmarkScenario('single_partial_batch', 50);
  await benchmarkScenario('five_full_batches', 1000);
  await benchmarkScenario('near_safety_cap', MAX_STALE_ROWS - 1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
