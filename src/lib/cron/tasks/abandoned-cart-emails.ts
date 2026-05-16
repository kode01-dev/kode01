import { processAbandonedCartEmailJobs } from '@/lib/cron/abandoned-cart-email-jobs';

export async function runAbandonedCartEmailsTask() {
  return processAbandonedCartEmailJobs();
}
