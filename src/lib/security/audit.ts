import { logSecurityEvent } from './security-log';
import { getTrustedClientIpFromHeaders } from './request-ip';
import type { Json } from '@/types/database.types';

type HeaderReader = {
  get(name: string): string | null;
};

export function getAuditContextFromHeaders(
  headers: HeaderReader,
  fallbackPath: string | null = null,
) {
  const ipAddress = getTrustedClientIpFromHeaders(headers);

  return {
    path: fallbackPath,
    ipAddress,
    userAgent: headers.get('user-agent') ?? null,
  };
}

export function getAuditContextFromRequest(request: Request) {
  let pathname: string | null = null;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = null;
  }

  return getAuditContextFromHeaders(request.headers, pathname);
}

type LogAuditEventInput = {
  eventType: string;
  userId?: string | null;
  path?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Json;
};

export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  await logSecurityEvent({
    eventType: input.eventType,
    userId: input.userId ?? null,
    path: input.path ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ?? {},
  });
}
