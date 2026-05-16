import { performance } from 'node:perf_hooks';
import bcrypt from 'bcryptjs';

type PasswordHistoryRow = {
  id: string;
  password_hash: string;
};

const PASSWORD_HISTORY_LIMIT = 5;
const BCRYPT_ROUNDS = 10;
const ITERATIONS = 12;
const WARMUP_ITERATIONS = 2;

async function buildHistory(args: {
  candidatePassword: string;
  reusedIndex: number | null;
}): Promise<PasswordHistoryRow[]> {
  const rows: PasswordHistoryRow[] = [];

  for (let index = 0; index < PASSWORD_HISTORY_LIMIT; index += 1) {
    const plainPassword = args.reusedIndex === index
      ? args.candidatePassword
      : `${args.candidatePassword}-history-${index}`;

    rows.push({
      id: `row-${index}`,
      password_hash: await bcrypt.hash(plainPassword, BCRYPT_ROUNDS),
    });
  }

  return rows;
}

async function hasReusedPasswordSequential(candidatePassword: string, rows: PasswordHistoryRow[]) {
  for (const row of rows) {
    const reused = await bcrypt.compare(candidatePassword, row.password_hash);
    if (reused) {
      return row.id;
    }
  }

  return null;
}

async function hasReusedPasswordConcurrent(candidatePassword: string, rows: PasswordHistoryRow[]) {
  const comparisons = await Promise.all(rows.map((row) => bcrypt.compare(candidatePassword, row.password_hash)));
  const reusedRowIndex = comparisons.findIndex((reused) => reused);
  return reusedRowIndex >= 0 ? rows[reusedRowIndex]?.id ?? null : null;
}

async function hasReusedPasswordHybrid(candidatePassword: string, rows: PasswordHistoryRow[]) {
  if (rows.length === 0) {
    return null;
  }

  const [mostRecentRow, ...remainingRows] = rows;
  if (await bcrypt.compare(candidatePassword, mostRecentRow.password_hash)) {
    return mostRecentRow.id;
  }

  if (remainingRows.length === 0) {
    return null;
  }

  const remainingChecks = await Promise.all(
    remainingRows.map((row) => bcrypt.compare(candidatePassword, row.password_hash)),
  );
  const reusedRowIndex = remainingChecks.findIndex((reused) => reused);
  return reusedRowIndex >= 0 ? remainingRows[reusedRowIndex]?.id ?? null : null;
}

async function runCase(args: {
  name: string;
  candidatePassword: string;
  rows: PasswordHistoryRow[];
  check: (candidatePassword: string, rows: PasswordHistoryRow[]) => Promise<string | null>;
}) {
  const durationsMs: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS + WARMUP_ITERATIONS; iteration += 1) {
    const startedAt = performance.now();
    await args.check(args.candidatePassword, args.rows);
    const durationMs = performance.now() - startedAt;

    if (iteration >= WARMUP_ITERATIONS) {
      durationsMs.push(durationMs);
    }
  }

  const avgMs = durationsMs.reduce((total, value) => total + value, 0) / durationsMs.length;

  return {
    name: args.name,
    avgMs: Number(avgMs.toFixed(2)),
    minMs: Number(Math.min(...durationsMs).toFixed(2)),
    maxMs: Number(Math.max(...durationsMs).toFixed(2)),
  };
}

function printDelta(name: string, baselineMs: number, optimizedMs: number) {
  const improvementMs = baselineMs - optimizedMs;
  const improvementPct = (improvementMs / baselineMs) * 100;

  console.log(
    JSON.stringify({
      name,
      improvementMs: Number(improvementMs.toFixed(2)),
      improvementPct: Number(improvementPct.toFixed(2)),
    }),
  );
}

async function benchmarkScenario(name: string, reusedIndex: number | null) {
  const candidatePassword = 'S3cure!Passw0rd';
  const rows = await buildHistory({ candidatePassword, reusedIndex });

  const sequential = await runCase({
    name: `${name}:sequential`,
    candidatePassword,
    rows,
    check: hasReusedPasswordSequential,
  });

  const concurrent = await runCase({
    name: `${name}:concurrent`,
    candidatePassword,
    rows,
    check: hasReusedPasswordConcurrent,
  });

  const hybrid = await runCase({
    name: `${name}:hybrid`,
    candidatePassword,
    rows,
    check: hasReusedPasswordHybrid,
  });

  console.log(JSON.stringify(sequential));
  console.log(JSON.stringify(concurrent));
  console.log(JSON.stringify(hybrid));
  printDelta(`${name}:delta:concurrent_vs_sequential`, sequential.avgMs, concurrent.avgMs);
  printDelta(`${name}:delta:hybrid_vs_sequential`, sequential.avgMs, hybrid.avgMs);
  printDelta(`${name}:delta:hybrid_vs_concurrent`, concurrent.avgMs, hybrid.avgMs);
}

async function main() {
  await benchmarkScenario('reuse_most_recent_entry', 0);
  await benchmarkScenario('reuse_oldest_entry', PASSWORD_HISTORY_LIMIT - 1);
  await benchmarkScenario('no_reuse', null);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
