import { runAgentJobAndWait } from '@/lib/agent-runtime/client';
import {
  getExecutionMode,
  resolveCronExecutionPolicy,
  shouldUseAgentRuntime,
} from '@/lib/agent-runtime/route-control';
import { invokeEdgeFunction } from '@/lib/edge/invoke';

export async function runWeeklyAiRecapTask(runId: string, authorization: string) {
  const executionMode = getExecutionMode();
  const cronPolicy = resolveCronExecutionPolicy('weekly-ai-recap', executionMode);
  if (!cronPolicy.enabled) {
    return {
      skipped: true,
      reason: cronPolicy.reason,
      owner: cronPolicy.owner,
      executionMode,
      flow: 'weekly-ai-recap',
    };
  }

  const runtimePayload = {
    flow: 'weekly-ai-recap' as const,
    mode: 'tick' as const,
    trigger: 'cron' as const,
    requestId: runId,
    source: 'next-cron-dispatcher',
  };

  if (shouldUseAgentRuntime(executionMode)) {
    const result = await runAgentJobAndWait(runtimePayload, {
      timeoutMs: 12_000,
    });

    if (result.kind === 'completed') {
      return {
        executionMode,
        runtime: 'modal',
        jobId: result.response.jobId,
        status: result.response.result?.status,
        body: result.response.result?.output ?? result.response.result,
      };
    }

    return {
      executionMode,
      runtime: 'modal',
      queued: true,
      jobId: result.jobId,
    };
  }

  const upstream = await invokeEdgeFunction({
    functionName: 'weekly-ai-recap-cron',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    requestId: runId,
    body: JSON.stringify({
      mode: 'tick',
      trigger: 'cron',
      source: 'next-cron-dispatcher',
    }),
  });

  const body = await upstream.text().catch(() => '');
  if (!upstream.ok) {
    throw new Error(`Weekly AI recap upstream failed (${upstream.status}): ${body || 'Unknown upstream error'}`);
  }

  let parsedBody: unknown = null;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parsedBody = body;
    }
  }

  return {
    upstreamStatus: upstream.status,
    upstreamOk: upstream.ok,
    body: parsedBody,
  };
}
