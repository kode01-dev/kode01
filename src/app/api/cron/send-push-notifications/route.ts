import { NextResponse } from 'next/server';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { sendPendingPushNotifications } from '@/features/notifications/server/push';

export const runtime = 'nodejs';

async function runPushCron(req: Request) {
  const run = startCronRun(req, 'send-push-notifications');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized', code: 'CRON_UNAUTHORIZED' }, { status: 401 }), run);
    }

    const result = await sendPendingPushNotifications();
    logCronSucceeded(run, result);
    return withCronHeaders(NextResponse.json(result), run);
  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(
      NextResponse.json({ error: 'Internal Server Error', code: 'CRON_EXECUTION_FAILED' }, { status: 500 }),
      run,
    );
  }
}

export async function GET(req: Request) {
  return runPushCron(req);
}

export async function POST(req: Request) {
  return runPushCron(req);
}
