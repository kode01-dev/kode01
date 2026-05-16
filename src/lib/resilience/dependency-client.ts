type CircuitState = {
  failureCount: number;
  openUntilMs: number;
};

type ResilientFetchOptions = {
  dependency: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
  retryableStatusCodes?: number[];
};

const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const circuitByDependency = new Map<string, CircuitState>();

export class DependencyRequestError extends Error {
  code: 'DEPENDENCY_UNAVAILABLE' | 'DEPENDENCY_TIMEOUT' | 'DEPENDENCY_CIRCUIT_OPEN';
  dependency: string;
  retryable: boolean;

  constructor(input: {
    message: string;
    code: DependencyRequestError['code'];
    dependency: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = 'DependencyRequestError';
    this.code = input.code;
    this.dependency = input.dependency;
    this.retryable = input.retryable ?? true;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCircuitState(dependency: string): CircuitState {
  const existing = circuitByDependency.get(dependency);
  if (existing) return existing;
  const initial: CircuitState = { failureCount: 0, openUntilMs: 0 };
  circuitByDependency.set(dependency, initial);
  return initial;
}

function markSuccess(dependency: string) {
  const state = getCircuitState(dependency);
  state.failureCount = 0;
  state.openUntilMs = 0;
}

function markFailure(dependency: string, threshold: number, openMs: number) {
  const state = getCircuitState(dependency);
  state.failureCount += 1;
  if (state.failureCount >= threshold) {
    state.openUntilMs = Date.now() + openMs;
  }
}

function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const raw = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));

  // Use cryptographically secure random numbers instead of Math.random()
  const randomBuffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomBuffer);
  // Max Uint32 value is 4294967295, use this to get a float between 0 and 1
  const randomFloat = randomBuffer[0] / 4294967296;

  const jitter = Math.floor(randomFloat * Math.max(1, Math.floor(raw * 0.2)));
  return raw + jitter;
}

function isRetryableStatus(status: number, retryableStatusCodes: Set<number>): boolean {
  return retryableStatusCodes.has(status);
}

export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions,
): Promise<Response> {
  const timeoutMs = Math.max(500, options.timeoutMs ?? 8_000);
  const maxAttempts = Math.max(1, Math.min(8, options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 5_000);
  const circuitFailureThreshold = Math.max(1, options.circuitFailureThreshold ?? 5);
  const circuitOpenMs = Math.max(500, options.circuitOpenMs ?? 15_000);
  const retryableStatusCodes = new Set(options.retryableStatusCodes ?? [...DEFAULT_RETRYABLE_STATUS_CODES]);

  const dependency = options.dependency;
  const circuit = getCircuitState(dependency);
  if (circuit.openUntilMs > Date.now()) {
    throw new DependencyRequestError({
      message: `Dependency "${dependency}" circuit is open`,
      code: 'DEPENDENCY_CIRCUIT_OPEN',
      dependency,
      retryable: true,
    });
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        markSuccess(dependency);
        return response;
      }

      if (!isRetryableStatus(response.status, retryableStatusCodes) || attempt >= maxAttempts) {
        if (isRetryableStatus(response.status, retryableStatusCodes)) {
          markFailure(dependency, circuitFailureThreshold, circuitOpenMs);
        } else {
          markSuccess(dependency);
        }
        return response;
      }

      markFailure(dependency, circuitFailureThreshold, circuitOpenMs);
      await sleep(computeBackoffMs(attempt, baseDelayMs, maxDelayMs));
    } catch (error) {
      clearTimeout(timeout);
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt >= maxAttempts) {
        markFailure(dependency, circuitFailureThreshold, circuitOpenMs);
        throw new DependencyRequestError({
          message: aborted
            ? `Dependency "${dependency}" timed out after ${timeoutMs}ms`
            : `Dependency "${dependency}" is unavailable`,
          code: aborted ? 'DEPENDENCY_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE',
          dependency,
          retryable: true,
        });
      }

      markFailure(dependency, circuitFailureThreshold, circuitOpenMs);
      await sleep(computeBackoffMs(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw new DependencyRequestError({
    message: `Dependency "${dependency}" request failed`,
    code: 'DEPENDENCY_UNAVAILABLE',
    dependency,
    retryable: true,
  });
}
