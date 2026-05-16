import { NextResponse } from 'next/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';

async function proxyCron(req: Request) {
  const run = startCronRun(req, 'send-emails');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' }, { status: 401 }), run);
    }

    const upstream = await invokeEdgeFunction({
      functionName: 'send-emails-cron',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.get('authorization') ?? '',
      },
      requestId: run.runId,
      body: JSON.stringify({ source: 'next-api-adapter' }),
    });

    const response = await toNextJsonResponse(upstream);
    logCronSucceeded(run, { upstreamStatus: upstream.status, upstreamOk: upstream.ok });
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
