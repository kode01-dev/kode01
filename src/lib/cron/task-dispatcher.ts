import { runAbandonedCartsTask } from './tasks/abandoned-carts';
import { runAbandonedCartEmailsTask } from './tasks/abandoned-cart-emails';
import { runPurgeCookieConsentTask } from './tasks/purge-cookie-consent-events';
import { runSendEmailsTask } from './tasks/send-emails';
import { runLicenseWebhookTask } from './tasks/license-webhooks';
import { runApiMonitorHealthTask } from './tasks/api-monitor-health';
import { runPurgeApiMonitorEventsTask } from './tasks/purge-api-monitor-events';
import { runOrderIncidentsSlaTask } from './tasks/order-incidents-sla';
import { runWeeklyAiRecapTask } from './tasks/weekly-ai-recap';
import { sendPendingPushNotifications } from '@/features/notifications/server/push';
import { createAdminClient } from '../supabase/admin';

export type CronTaskResult = {
  name: string;
  success: boolean;
  durationMs: number;
  data?: unknown;
  error?: string;
};

export async function runKeepWarmTask() {
  const supabase = createAdminClient();
  await supabase.from('profiles').select('id').limit(1).maybeSingle();
  return { ok: true };
}

export const CRON_TASKS = {
  'keep-warm': runKeepWarmTask,
  'abandoned-carts': runAbandonedCartsTask,
  'abandoned-cart-emails': runAbandonedCartEmailsTask,
  'purge-cookie-consent-events': runPurgeCookieConsentTask,
  'send-emails': runSendEmailsTask,
  'license-webhooks': runLicenseWebhookTask,
  'api-monitor-health': runApiMonitorHealthTask,
  'purge-api-monitor-events': runPurgeApiMonitorEventsTask,
  'order-incidents-sla': runOrderIncidentsSlaTask,
  'weekly-ai-recap': runWeeklyAiRecapTask,
  'send-push-notifications': sendPendingPushNotifications,
} as const;

export type CronTaskName = keyof typeof CRON_TASKS;

export const CRON_TASK_MATRIX: Record<CronTaskName, {
  owner: string;
  frequency: string;
  timeoutMs: number;
  idempotencyKey: string;
  retry: string;
  alert: string;
  runbook: string;
}> = {
  'keep-warm': {
    owner: 'platform',
    frequency: 'dispatcher',
    timeoutMs: 10_000,
    idempotencyKey: 'task-name + run-id',
    retry: 'safe to retry',
    alert: 'warn after 2 consecutive failures',
    runbook: '/admin/api-monitoring',
  },
  'abandoned-carts': {
    owner: 'growth',
    frequency: 'dispatcher',
    timeoutMs: 30_000,
    idempotencyKey: 'cart-id + notification stage',
    retry: 'safe to retry after stale lock',
    alert: 'alert when pending count grows',
    runbook: '/admin/finance',
  },
  'abandoned-cart-emails': {
    owner: 'growth',
    frequency: 'dispatcher',
    timeoutMs: 45_000,
    idempotencyKey: 'email-job-id',
    retry: 'safe to retry pending/failed jobs',
    alert: 'alert on failed send batch',
    runbook: '/admin/api-monitoring',
  },
  'purge-cookie-consent-events': {
    owner: 'privacy',
    frequency: 'dispatcher',
    timeoutMs: 20_000,
    idempotencyKey: 'retention window',
    retry: 'safe to retry',
    alert: 'warn after failure',
    runbook: '/admin/privacy-cookies',
  },
  'send-emails': {
    owner: 'lifecycle',
    frequency: 'dispatcher',
    timeoutMs: 45_000,
    idempotencyKey: 'scheduled-email-id',
    retry: 'safe to retry pending emails',
    alert: 'alert on provider failures',
    runbook: '/admin/api-monitoring',
  },
  'license-webhooks': {
    owner: 'platform',
    frequency: 'dispatcher',
    timeoutMs: 45_000,
    idempotencyKey: 'license-webhook-delivery-id',
    retry: 'exponential retry until max attempts',
    alert: 'alert on dead-letter deliveries',
    runbook: '/admin/api-monitoring',
  },
  'api-monitor-health': {
    owner: 'reliability',
    frequency: 'dispatcher',
    timeoutMs: 30_000,
    idempotencyKey: 'endpoint + window',
    retry: 'safe to retry',
    alert: 'alert when endpoint unhealthy',
    runbook: '/admin/api-monitoring',
  },
  'purge-api-monitor-events': {
    owner: 'reliability',
    frequency: 'dispatcher',
    timeoutMs: 20_000,
    idempotencyKey: 'retention window',
    retry: 'safe to retry',
    alert: 'warn after failure',
    runbook: '/admin/api-monitoring',
  },
  'order-incidents-sla': {
    owner: 'support',
    frequency: 'dispatcher',
    timeoutMs: 30_000,
    idempotencyKey: 'incident-id + sla-state',
    retry: 'safe to retry',
    alert: 'alert on overdue incidents',
    runbook: '/admin/order-incidents',
  },
  'send-push-notifications': {
    owner: 'notifications',
    frequency: 'dispatcher',
    timeoutMs: 45_000,
    idempotencyKey: 'notification-id + subscription-id',
    retry: 'exponential retry until max attempts',
    alert: 'alert on failed push delivery batch',
    runbook: '/admin/controllers',
  },
  'weekly-ai-recap': {
    owner: 'content',
    frequency: 'dedicated cron + dispatcher',
    timeoutMs: 60_000,
    idempotencyKey: 'recap-run-date',
    retry: 'manual retry from admin',
    alert: 'alert on failed run',
    runbook: '/admin/ai-recap',
  },
};

export async function executeTask(name: CronTaskName, runId: string, authHeader: string): Promise<CronTaskResult> {
  const start = Date.now();
  try {
    let data: unknown;
    if (name === 'send-emails') {
      data = await runSendEmailsTask(runId, authHeader);
    } else if (name === 'weekly-ai-recap') {
      data = await runWeeklyAiRecapTask(runId, authHeader);
    } else if (name === 'purge-cookie-consent-events' || name === 'license-webhooks') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data = await (CRON_TASKS[name] as any)(runId);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data = await (CRON_TASKS[name] as any)();
    }

    return {
      name,
      success: true,
      durationMs: Date.now() - start,
      data,
    };
  } catch (error) {
    return {
      name,
      success: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
