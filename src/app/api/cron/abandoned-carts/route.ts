import { NextResponse } from 'next/server';
import { enqueueAbandonedCartEmailJobs } from '@/lib/cron/abandoned-cart-email-jobs';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';

async function runAbandonedCartsCron(request: Request) {
  const run = startCronRun(request, 'abandoned-carts');

  try {
    if (!isCronAuthorized(request)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const result = await enqueueAbandonedCartEmailJobs();
    logCronSucceeded(run, result);
    return withCronHeaders(NextResponse.json({ success: true, ...result }), run);
  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 }),
      run,
    );
  }
}

export async function GET(request: Request) {
  return runAbandonedCartsCron(request);
}

export async function POST(request: Request) {
  return runAbandonedCartsCron(request);
}
