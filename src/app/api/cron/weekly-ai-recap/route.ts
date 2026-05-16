import { NextResponse } from 'next/server';
import { mirrorAgentJob } from '@/lib/agent-runtime/client';
import {
  getExecutionMode,
  resolveCronExecutionPolicy,
  runAgentOrAccepted,
  shouldUseAgentRuntime,
  shouldWaitForAgentCompletion,
} from '@/lib/agent-runtime/route-control';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

async function proxyCron(req: Request) {
  const run = startCronRun(req, 'weekly-ai-recap');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' }, { status: 401 }), run);
    }

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const executionMode = getExecutionMode();
    const cronPolicy = resolveCronExecutionPolicy('weekly-ai-recap', executionMode);
    if (!cronPolicy.enabled) {
      logCronSucceeded(run, {
        skipped: true,
        reason: cronPolicy.reason,
        owner: cronPolicy.owner,
        executionMode,
      });
      return withCronHeaders(
        NextResponse.json({
          success: true,
          skipped: true,
          reason: cronPolicy.reason,
          owner: cronPolicy.owner,
          flow: 'weekly-ai-recap',
          code: 'CRON_EXECUTION_SKIPPED',
        }),
        run,
      );
    }

    const runtimePayload = {
      flow: 'weekly-ai-recap' as const,
      mode: 'tick' as const,
      trigger: 'cron' as const,
      requestId: run.runId,
      ...payload,
    };

    if (shouldUseAgentRuntime(executionMode)) {
      const agentResponse = await runAgentOrAccepted(runtimePayload, {
        wait: shouldWaitForAgentCompletion(req),
      });
      logCronSucceeded(run, { upstreamStatus: agentResponse.status, upstreamOk: agentResponse.ok, executionMode });
      return withCronHeaders(agentResponse, run);
    }

    if (executionMode !== 'vercel') {
      void mirrorAgentJob(runtimePayload);
    }

    const upstream = await invokeEdgeFunction({
      functionName: 'weekly-ai-recap-cron',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.get('authorization') ?? '',
      },
      requestId: run.runId,
      body: JSON.stringify({
        mode: 'tick',
        trigger: 'cron',
        ...payload,
      }),
    });

    const response = await toNextJsonResponse(upstream);
    logCronSucceeded(run, { upstreamStatus: upstream.status, upstreamOk: upstream.ok, executionMode });
    return withCronHeaders(response, run);
  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(
      NextResponse.json({ error: 'Internal Server Error', code: 'CRON_EXECUTION_FAILED' }, { status: 500 }),
      run,
    );
  }
}

export async function GET(req: Request) {
  return proxyCron(req);
}

export async function POST(req: Request) {
  return proxyCron(req);
}
