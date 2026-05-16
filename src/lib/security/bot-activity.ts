import 'server-only';

import { logBotActivityDirect } from './security-log';
import type { Json } from '@/types/database.types';

type BotActivityInput = {
  source: string;
  reason: string;
  path?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  blocked?: boolean;
};

export async function logBotActivity(input: BotActivityInput): Promise<void> {
  await logBotActivityDirect({
    source: input.source,
    reason: input.reason,
    path: input.path,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    details: (input.details ?? {}) as Json,
    blocked: input.blocked,
  });
}
