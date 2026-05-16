import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { EnqueuePayload } from '@/lib/agent-runtime/contracts';

let enqueueAgentJobImpl: (payload: EnqueuePayload) => Promise<{ jobId: string; status: string }>;
let runAgentJobAndWaitImpl: (
  payload: EnqueuePayload,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
) => Promise<
  | { kind: 'completed'; jobId: string; response: unknown }
  | { kind: 'accepted'; jobId: string; response: unknown }
>;

mock.module('@/lib/agent-runtime/client', {
  namedExports: {
    enqueueAgentJob: async (payload: EnqueuePayload) => enqueueAgentJobImpl(payload),
    runAgentJobAndWait: async (
      payload: EnqueuePayload,
      options?: { timeoutMs?: number; pollIntervalMs?: number },
    ) => runAgentJobAndWaitImpl(payload, options),
  },
});

mock.module('@/lib/agent-runtime/env', {
  namedExports: {
    canUseModalRuntime: () => true,
    getAgentRuntimeEnv: () => ({
      mode: 'modal',
      modalApiUrl: 'https://runtime.example.com',
      internalToken: 'token',
      internalTokenNext: null,
      internalAuthMaxSkewSeconds: 300,
    }),
  },
});

async function loadRouteControl(scenario: string) {
  return import(`../../src/lib/agent-runtime/route-control.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('shouldWaitForAgentCompletion parses wait=true query values', async () => {
  enqueueAgentJobImpl = async () => ({ jobId: 'job-unused', status: 'queued' });
  runAgentJobAndWaitImpl = async () => ({ kind: 'accepted', jobId: 'job-unused', response: {} });

  const routeControl = await loadRouteControl('wait-query');
  assert.equal(routeControl.shouldWaitForAgentCompletion(new Request('http://localhost/api/cron?wait=true')), true);
  assert.equal(routeControl.shouldWaitForAgentCompletion(new Request('http://localhost/api/cron?wait=1')), true);
  assert.equal(routeControl.shouldWaitForAgentCompletion(new Request('http://localhost/api/cron?wait=yes')), true);
  assert.equal(routeControl.shouldWaitForAgentCompletion(new Request('http://localhost/api/cron?wait=false')), false);
  assert.equal(routeControl.shouldWaitForAgentCompletion(new Request('http://localhost/api/cron')), false);
});

test('runAgentOrAccepted returns 202 queued by default without waiting', async () => {
  let enqueuedCount = 0;
  let waitedCount = 0;
  enqueueAgentJobImpl = async () => {
    enqueuedCount += 1;
    return { jobId: 'job-queued-1', status: 'queued' };
  };
  runAgentJobAndWaitImpl = async () => {
    waitedCount += 1;
    return { kind: 'accepted', jobId: 'job-unexpected', response: {} };
  };

  const routeControl = await loadRouteControl('queued-default');
  const response = await routeControl.runAgentOrAccepted({
    flow: 'weekly-ai-recap',
    mode: 'tick',
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.status, 'queued');
  assert.equal(body.jobId, 'job-queued-1');
  assert.equal(body.code, 'RUNTIME_JOB_QUEUED');
  assert.equal(enqueuedCount, 1);
  assert.equal(waitedCount, 0);
});

test('runAgentOrAccepted waits when explicitly requested', async () => {
  let timeoutUsed = 0;
  enqueueAgentJobImpl = async () => ({ jobId: 'job-unused', status: 'queued' });
  runAgentJobAndWaitImpl = async (_payload, options) => {
    timeoutUsed = options?.timeoutMs ?? 0;
    return {
      kind: 'completed',
      jobId: 'job-sync-1',
      response: {
        jobId: 'job-sync-1',
        status: 'succeeded',
        result: {
          status: 'succeeded',
          flow: 'weekly-ai-recap',
          mode: 'tick',
          startedAt: '2026-03-28T00:00:00.000Z',
          finishedAt: '2026-03-28T00:00:02.000Z',
          summary: { imported: 2 },
          output: { status: 201, body: { imported: 2 } },
        },
      },
    };
  };

  const routeControl = await loadRouteControl('wait-true');
  const response = await routeControl.runAgentOrAccepted(
    {
      flow: 'weekly-ai-recap',
      mode: 'tick',
    },
    { wait: true },
  );

  assert.equal(timeoutUsed, 12_000);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body, { imported: 2 });
});

test('resolveCronExecutionPolicy disables vercel cron execution when owner is modal', async () => {
  const original = {
    AGENT_CRON_OWNER_WEEKLY_RECAP: process.env.AGENT_CRON_OWNER_WEEKLY_RECAP,
    AGENT_CRON_KILL_SWITCH: process.env.AGENT_CRON_KILL_SWITCH,
    AGENT_CRON_DISABLE_WEEKLY_RECAP: process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP,
    AGENT_CRON_DISABLED_FLOWS: process.env.AGENT_CRON_DISABLED_FLOWS,
  };
  try {
    process.env.AGENT_CRON_OWNER_WEEKLY_RECAP = 'modal';
    delete process.env.AGENT_CRON_KILL_SWITCH;
    delete process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    delete process.env.AGENT_CRON_DISABLED_FLOWS;

    const routeControl = await loadRouteControl('cron-owner-modal');
    const policy = routeControl.resolveCronExecutionPolicy('weekly-ai-recap', 'modal');

    assert.equal(policy.enabled, false);
    assert.equal(policy.owner, 'modal');
    assert.equal(policy.reason, 'owner_mismatch');
  } finally {
    process.env.AGENT_CRON_OWNER_WEEKLY_RECAP = original.AGENT_CRON_OWNER_WEEKLY_RECAP;
    process.env.AGENT_CRON_KILL_SWITCH = original.AGENT_CRON_KILL_SWITCH;
    process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP = original.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    process.env.AGENT_CRON_DISABLED_FLOWS = original.AGENT_CRON_DISABLED_FLOWS;
  }
});

test('resolveCronExecutionPolicy enables weekly recap when Vercel owns production cron', async () => {
  const original = {
    AGENT_CRON_OWNER_WEEKLY_RECAP: process.env.AGENT_CRON_OWNER_WEEKLY_RECAP,
    AGENT_CRON_KILL_SWITCH: process.env.AGENT_CRON_KILL_SWITCH,
    AGENT_CRON_DISABLE_WEEKLY_RECAP: process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP,
    AGENT_CRON_DISABLED_FLOWS: process.env.AGENT_CRON_DISABLED_FLOWS,
  };
  try {
    process.env.AGENT_CRON_OWNER_WEEKLY_RECAP = 'vercel';
    delete process.env.AGENT_CRON_KILL_SWITCH;
    delete process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    delete process.env.AGENT_CRON_DISABLED_FLOWS;

    const routeControl = await loadRouteControl('cron-owner-vercel');
    const policy = routeControl.resolveCronExecutionPolicy('weekly-ai-recap', 'vercel');

    assert.equal(policy.enabled, true);
    assert.equal(policy.owner, 'vercel');
    assert.equal(policy.reason, null);
  } finally {
    process.env.AGENT_CRON_OWNER_WEEKLY_RECAP = original.AGENT_CRON_OWNER_WEEKLY_RECAP;
    process.env.AGENT_CRON_KILL_SWITCH = original.AGENT_CRON_KILL_SWITCH;
    process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP = original.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    process.env.AGENT_CRON_DISABLED_FLOWS = original.AGENT_CRON_DISABLED_FLOWS;
  }
});

test('resolveCronExecutionPolicy applies global kill switch', async () => {
  const original = {
    AGENT_CRON_KILL_SWITCH: process.env.AGENT_CRON_KILL_SWITCH,
    AGENT_CRON_OWNER_WEEKLY_RECAP: process.env.AGENT_CRON_OWNER_WEEKLY_RECAP,
    AGENT_CRON_DISABLE_WEEKLY_RECAP: process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP,
    AGENT_CRON_DISABLED_FLOWS: process.env.AGENT_CRON_DISABLED_FLOWS,
  };
  try {
    process.env.AGENT_CRON_KILL_SWITCH = 'true';
    delete process.env.AGENT_CRON_OWNER_WEEKLY_RECAP;
    delete process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    delete process.env.AGENT_CRON_DISABLED_FLOWS;

    const routeControl = await loadRouteControl('cron-kill-switch');
    const policy = routeControl.resolveCronExecutionPolicy('weekly-ai-recap', 'vercel');

    assert.equal(policy.enabled, false);
    assert.equal(policy.reason, 'kill_switch');
  } finally {
    process.env.AGENT_CRON_KILL_SWITCH = original.AGENT_CRON_KILL_SWITCH;
    process.env.AGENT_CRON_OWNER_WEEKLY_RECAP = original.AGENT_CRON_OWNER_WEEKLY_RECAP;
    process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP = original.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    process.env.AGENT_CRON_DISABLED_FLOWS = original.AGENT_CRON_DISABLED_FLOWS;
  }
});
