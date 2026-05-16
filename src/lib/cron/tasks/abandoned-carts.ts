import { enqueueAbandonedCartEmailJobs } from '@/lib/cron/abandoned-cart-email-jobs';

export async function runAbandonedCartsTask() {
  return enqueueAbandonedCartEmailJobs();
}
