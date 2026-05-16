import { randomUUID } from 'crypto';

type CronLogMetadata = Record<string, unknown>;

export type CronRun = {
  name: string;
  runId: string;
  startedAtMs: number;
  method: string;
  path: string | null;
};

function resolvePath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function withBaseMetadata(run: CronRun, metadata?: CronLogMetadata): CronLogMetadata {
  return {
    cron: run.name,
    runId: run.runId,
    method: run.method,
    path: run.path,
    durationMs: Date.now() - run.startedAtMs,
    ...(metadata ?? {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function startCronRun(req: Request, cronName: string, metadata?: CronLogMetadata): CronRun {
  const run: CronRun = {
    name: cronName,
    runId: req.headers.get('x-request-id')?.trim() || randomUUID(),
    startedAtMs: Date.now(),
    method: req.method,
    path: resolvePath(req.url),
  };

  console.info('cron.started', withBaseMetadata(run, metadata));
  return run;
}

export function logCronUnauthorized(run: CronRun, metadata?: CronLogMetadata): void {
  console.warn('cron.unauthorized', withBaseMetadata(run, metadata));
}

export function logCronSucceeded(run: CronRun, metadata?: CronLogMetadata): void {
  console.info('cron.succeeded', withBaseMetadata(run, metadata));
}

export function logCronFailed(run: CronRun, error: unknown, metadata?: CronLogMetadata): void {
  console.error('cron.failed', withBaseMetadata(run, { error: errorMessage(error), ...(metadata ?? {}) }));
}

export function withCronHeaders(response: Response, run: CronRun): Response {
  response.headers.set('x-cron-run-id', run.runId);
  response.headers.set('x-cron-name', run.name);
  return response;
}
