import { NextResponse } from 'next/server';
import type { EnqueuePayload, InternalJobStatusResponse } from '@/lib/agent-runtime/contracts';
import { enqueueAgentJob, runAgentJobAndWait } from '@/lib/agent-runtime/client';
import { canUseModalRuntime, getAgentRuntimeEnv, type AgentExecutionMode } from '@/lib/agent-runtime/env';

type JobOutputResponseShape = {
  status?: number;
  body?: unknown;
};

const WAIT_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_SYNC_WAIT_TIMEOUT_MS = 12_000;
const CRON_OWNER_VALUES = new Set(['vercel', 'modal']);
const CRON_DISABLED_FLOW_VALUES = new Set(['weekly-ai-recap']);

export type AgentCronFlow = 'weekly-ai-recap';
export type AgentCronOwner = 'vercel' | 'modal';
export type AgentCronExecutionPolicy = {
  enabled: boolean;
  owner: AgentCronOwner;
  reason: null | 'kill_switch' | 'flow_disabled' | 'owner_mismatch';
};

function asOutputShape(value: unknown): JobOutputResponseShape | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const body = candidate.body;
  return { status, body };
}

export function getExecutionMode(): AgentExecutionMode {
  return getAgentRuntimeEnv().mode;
}

export function shouldUseAgentRuntime(mode: AgentExecutionMode): boolean {
  return mode === 'modal' && canUseModalRuntime();
}

export function shouldWaitForAgentCompletion(request: Request): boolean {
  const rawWait = new URL(request.url).searchParams.get('wait');
  if (!rawWait) return false;
  return WAIT_TRUE_VALUES.has(rawWait.trim().toLowerCase());
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function defaultCronOwner(mode: AgentExecutionMode): AgentCronOwner {
  return mode === 'modal' ? 'modal' : 'vercel';
}

function parseCronOwner(value: string | undefined, fallback: AgentCronOwner): AgentCronOwner {
  const normalized = value?.trim().toLowerCase();
  return normalized && CRON_OWNER_VALUES.has(normalized)
    ? (normalized as AgentCronOwner)
    : fallback;
}

function parseDisabledFlows(value: string | undefined): Set<AgentCronFlow> {
  const disabled = new Set<AgentCronFlow>();
  if (!value) return disabled;

  for (const item of value.split(',')) {
    const normalized = item.trim().toLowerCase();
    if (CRON_DISABLED_FLOW_VALUES.has(normalized)) {
      disabled.add(normalized as AgentCronFlow);
    }
  }

  return disabled;
}

function ownerEnvKey(): 'AGENT_CRON_OWNER_WEEKLY_RECAP' {
  return 'AGENT_CRON_OWNER_WEEKLY_RECAP';
}

function disableEnvKey(): 'AGENT_CRON_DISABLE_WEEKLY_RECAP' {
  return 'AGENT_CRON_DISABLE_WEEKLY_RECAP';
}

export function resolveCronExecutionPolicy(
  flow: AgentCronFlow,
  mode: AgentExecutionMode = getExecutionMode(),
): AgentCronExecutionPolicy {
  const owner = parseCronOwner(
    process.env[ownerEnvKey()],
    defaultCronOwner(mode),
  );

  if (parseBoolean(process.env.AGENT_CRON_KILL_SWITCH)) {
    return { enabled: false, owner, reason: 'kill_switch' };
  }

  if (parseBoolean(process.env[disableEnvKey()])) {
    return { enabled: false, owner, reason: 'flow_disabled' };
  }

  const disabledFlows = parseDisabledFlows(process.env.AGENT_CRON_DISABLED_FLOWS);
  if (disabledFlows.has(flow)) {
    return { enabled: false, owner, reason: 'flow_disabled' };
  }

  if (owner !== 'vercel') {
    return { enabled: false, owner, reason: 'owner_mismatch' };
  }

  return { enabled: true, owner, reason: null };
}

export function completedJobToNextResponse(job: InternalJobStatusResponse): NextResponse {
  if (!job.result) {
    return NextResponse.json(
      { error: job.error ?? 'Missing job result', code: 'RUNTIME_JOB_RESULT_MISSING', jobId: job.jobId },
      { status: 502 },
    );
  }

  const output = asOutputShape(job.result.output);
  if (output) {
    return NextResponse.json(
      output.body ?? { status: job.result.status, summary: job.result.summary, jobId: job.jobId },
      { status: output.status ?? (job.result.status === 'failed' ? 500 : 200) },
    );
  }

  return NextResponse.json(
    {
      status: job.result.status,
      summary: job.result.summary,
      error: job.result.error,
      code: job.result.status === 'failed' ? 'RUNTIME_JOB_FAILED' : undefined,
      jobId: job.jobId,
    },
    { status: job.result.status === 'failed' ? 500 : 200 },
  );
}

export async function runAgentOrAccepted(
  payload: EnqueuePayload,
  options?: { wait?: boolean; waitTimeoutMs?: number; pollIntervalMs?: number },
): Promise<NextResponse> {
  const waitForCompletion = options?.wait === true;
  if (!waitForCompletion) {
    const enqueued = await enqueueAgentJob(payload);
    return NextResponse.json(
      {
        status: 'queued',
        jobId: enqueued.jobId,
        code: 'RUNTIME_JOB_QUEUED',
        message: 'Job accepted and queued.',
      },
      { status: 202 },
    );
  }

  const result = await runAgentJobAndWait(payload, {
    timeoutMs: options?.waitTimeoutMs ?? DEFAULT_SYNC_WAIT_TIMEOUT_MS,
    pollIntervalMs: options?.pollIntervalMs,
  });
  if (result.kind === 'completed') {
    return completedJobToNextResponse(result.response);
  }

  return NextResponse.json(
    { status: 'queued', jobId: result.jobId, code: 'RUNTIME_JOB_QUEUED', message: 'Job accepted and still running.' },
    { status: 202 },
  );
}
