import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { startCronRun, logCronUnauthorized, logCronSucceeded, logCronFailed, withCronHeaders } from '@/lib/cron/run-log';
import { executeTask, CRON_TASKS, CronTaskName } from '@/lib/cron/task-dispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const run = startCronRun(req, 'dispatcher');
  const { searchParams } = new URL(req.url);
  const taskParam = searchParams.get('task');
  const authHeader = req.headers.get('authorization') ?? '';

  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

    const tasksToRun: CronTaskName[] = taskParam 
      ? (taskParam.split(',').filter(t => t in CRON_TASKS) as CronTaskName[])
      : (Object.keys(CRON_TASKS) as CronTaskName[]);

    if (tasksToRun.length === 0) {
      return withCronHeaders(NextResponse.json({ error: 'No valid tasks specified' }, { status: 400 }), run);
    }

    const results = [];
    for (const taskName of tasksToRun) {
      const result = await executeTask(taskName, run.runId, authHeader);
      results.push(result);
      
      if (!result.success) {
        console.error(`Cron task ${taskName} failed:`, result.error);
      }
    }

    const allSent = results.every(r => r.success);
    if (allSent) {
      logCronSucceeded(run, { tasksCount: results.length, results });
    } else {
      logCronFailed(run, 'One or more tasks failed', { results });
    }

    return withCronHeaders(NextResponse.json({
      success: allSent,
      runId: run.runId,
      tasks: results,
    }), run);

  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(
      NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
      run,
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
