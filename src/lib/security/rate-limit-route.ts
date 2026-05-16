import { NextResponse } from 'next/server';
import { toRateLimitExceededResponse } from './rate-limit-http';
import { checkRateLimit } from './rate-limiter';
import { buildRateLimitKey, getRequesterIp } from './rate-limit-request';
import { logSecurityEvent } from './security-log';
import { isIpWhitelisted } from './whitelist';
import type { RateLimitAction } from './rate-limit-schemas';

type EnforceRateLimitInput = {
  request: Request;
  action: RateLimitAction;
  extraKeyPart?: string;
};

async function checkAndHandleRouteRateLimit({
  request,
  action,
  requesterIp,
  key,
  scope,
}: {
  request: Request;
  action: RateLimitAction;
  requesterIp: string;
  key: string;
  scope: 'ip' | 'ip_plus_identifier';
}): Promise<NextResponse | null> {
  const result = await checkRateLimit({
    action,
    key,
  });

  if (result.allowed) {
    return null;
  }

  void logSecurityEvent({
    eventType: 'security.rate_limit_exceeded',
    ipAddress: requesterIp,
    userAgent: request.headers.get('user-agent'),
    path: new URL(request.url).pathname,
    metadata: {
      action,
      scope,
      key: result.key,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
      degraded: result.degraded,
    },
  });

  return toRateLimitExceededResponse(result);
}

export async function enforceRouteRateLimit({
  request,
  action,
  extraKeyPart,
}: EnforceRateLimitInput): Promise<NextResponse | null> {
  const requesterIp = getRequesterIp(request);

  // Skip security checks for whitelisted IPs
  if (isIpWhitelisted(requesterIp)) {
    return null;
  }

  const ipKey = buildRateLimitKey(['rate-limit', action, requesterIp]);
  const ipLimitedResponse = await checkAndHandleRouteRateLimit({
    request,
    action,
    requesterIp,
    key: ipKey,
    scope: 'ip',
  });
  if (ipLimitedResponse) {
    return ipLimitedResponse;
  }

  const normalizedExtraKeyPart = extraKeyPart?.trim();
  if (!normalizedExtraKeyPart) {
    return null;
  }

  const contextualKey = buildRateLimitKey(['rate-limit', action, requesterIp, normalizedExtraKeyPart]);
  return checkAndHandleRouteRateLimit({
    request,
    action,
    requesterIp,
    key: contextualKey,
    scope: 'ip_plus_identifier',
  });
}
