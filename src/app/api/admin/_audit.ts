import { headers } from 'next/headers';
import {
  getAuditContextFromHeaders,
  getAuditContextFromRequest,
  logAuditEvent,
} from '@/lib/security/audit';

type AdminApiAuthDecisionInput = {
  granted: boolean;
  userId?: string | null;
  request?: Request;
  scope?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

async function resolveAuditContext(request?: Request) {
  if (request) {
    return getAuditContextFromRequest(request);
  }

  try {
    const requestHeaders = await headers();
    return getAuditContextFromHeaders(requestHeaders, null);
  } catch {
    return {
      path: null,
      ipAddress: null,
      userAgent: null,
    };
  }
}

export async function logAdminApiAuthDecision({
  granted,
  userId,
  request,
  scope,
  reason,
  metadata,
}: AdminApiAuthDecisionInput): Promise<void> {
  const auditContext = await resolveAuditContext(request);

  await logAuditEvent({
    ...auditContext,
    userId: userId ?? null,
    eventType: granted ? 'admin.api.authz.granted' : 'admin.api.authz.denied',
    metadata: {
      scope: scope ?? 'admin.api',
      reason: reason ?? null,
      ...(metadata ?? {}),
    },
  });
}
