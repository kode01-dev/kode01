import {
  type EnqueuePayload,
  type InternalEnqueueResponse,
  type InternalJobStatusResponse,
  withIdempotencyKey,
} from '@/lib/agent-runtime/contracts';
import { canUseModalRuntime, getAgentRuntimeEnv } from '@/lib/agent-runtime/env';
import { resilientFetch } from '@/lib/resilience/dependency-client';
import { buildInternalAuthHeaders } from '@/lib/security/internal-auth';

const DEFAULT_WAIT_TIMEOUT_MS = 110_000;
const DEFAULT_POLL_INTERVAL_MS = 2_500;

export type AgentRunResult =
  | { kind: 'completed'; jobId: string; response: InternalJobStatusResponse }
  | { kind: 'accepted'; jobId: string; response: InternalEnqueueResponse };

function getRuntimeConfig() {
  const runtimeEnv = getAgentRuntimeEnv();
  if (!canUseModalRuntime(runtimeEnv)) {
    throw new Error('Modal runtime is not configured. Set MODAL_AGENT_API_URL and AGENT_INTERNAL_TOKEN.');
  }

  return {
    baseUrl: runtimeEnv.modalApiUrl as string,
    token: (runtimeEnv.internalToken ?? runtimeEnv.internalTokenNext) as string,
  };
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function withRequestIdentity(payload: EnqueuePayload): EnqueuePayload & { requestId: string; idempotencyKey: string } {
  const requestId = payload.requestId?.trim() || crypto.randomUUID();
  return withIdempotencyKey({
    ...payload,
    requestId,
  });
}

export async function enqueueAgentJob(payload: EnqueuePayload): Promise<InternalEnqueueResponse> {
  const runtime = getRuntimeConfig();
  const normalizedPayload = withRequestIdentity(payload);
  const endpointPath = '/internal/jobs';
  const response = await resilientFetch(`${runtime.baseUrl.replace(/\/+$/, '')}${endpointPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildInternalAuthHeaders({
        method: 'POST',
        path: endpointPath,
        secret: runtime.token,
      }),
    },
    body: JSON.stringify(normalizedPayload),
    cache: 'no-store',
  }, {
    dependency: 'modal_agent_runtime',
    timeoutMs: 8_000,
    maxAttempts: 3,
    circuitFailureThreshold: 4,
    circuitOpenMs: 20_000,
  });

  const body = await parseJsonSafe<InternalEnqueueResponse & { error?: string }>(response);
  if (!response.ok || !body?.jobId) {
    throw new Error(body?.error || `Failed to enqueue modal job (status ${response.status})`);
  }
  return body;
}

export async function getAgentJobStatus(jobId: string): Promise<InternalJobStatusResponse> {
  const runtime = getRuntimeConfig();
  const endpointPath = `/internal/jobs/${encodeURIComponent(jobId)}`;
  const response = await resilientFetch(`${runtime.baseUrl.replace(/\/+$/, '')}${endpointPath}`, {
    method: 'GET',
    headers: {
      ...buildInternalAuthHeaders({
        method: 'GET',
        path: endpointPath,
        secret: runtime.token,
      }),
    },
    cache: 'no-store',
  }, {
    dependency: 'modal_agent_runtime',
    timeoutMs: 8_000,
    maxAttempts: 3,
    circuitFailureThreshold: 4,
    circuitOpenMs: 20_000,
  });

  const body = await parseJsonSafe<InternalJobStatusResponse & { error?: string }>(response);
  if (!response.ok || !body?.jobId) {
    throw new Error(body?.error || `Failed to fetch modal job status (status ${response.status})`);
  }
  return body;
}

function isTerminalStatus(status: InternalJobStatusResponse['status']) {
  return status === 'succeeded' || status === 'failed' || status === 'dead_letter';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAgentJobAndWait(
  payload: EnqueuePayload,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<AgentRunResult> {
  const enqueued = await enqueueAgentJob(payload);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const jobStatus = await getAgentJobStatus(enqueued.jobId);
    if (isTerminalStatus(jobStatus.status)) {
      return {
        kind: 'completed',
        jobId: enqueued.jobId,
        response: jobStatus,
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    kind: 'accepted',
    jobId: enqueued.jobId,
    response: enqueued,
  };
}

export async function mirrorAgentJob(payload: EnqueuePayload): Promise<void> {
  try {
    await enqueueAgentJob(payload);
  } catch (error) {
    console.warn('Modal mirror enqueue failed:', error);
  }
}
