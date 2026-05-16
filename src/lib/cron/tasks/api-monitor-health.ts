import { runApiMonitorHealthEvaluation } from '@/features/api-monitoring/server/health-runner';

export async function runApiMonitorHealthTask() {
  const result = await runApiMonitorHealthEvaluation();
  return {
    checkedAt: result.checkedAt,
    notificationsSent: result.notificationsSent,
    endpointCount: result.endpoints.length,
    alertTransitions: result.alertTransitions,
  };
}
