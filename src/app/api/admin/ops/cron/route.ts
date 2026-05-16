import { NextResponse } from 'next/server';
import { CRON_TASK_MATRIX } from '@/lib/cron/task-dispatcher';
import { getAdminSessionOrNull } from '../../api-monitoring/_lib';

export async function GET(request: Request) {
  const adminSession = await getAdminSessionOrNull(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    tasks: Object.entries(CRON_TASK_MATRIX).map(([name, metadata]) => ({
      name,
      ...metadata,
    })),
  });
}
