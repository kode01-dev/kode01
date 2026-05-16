import { NextResponse } from 'next/server';
import type { RateLimitCheckResult } from './rate-limiter';

function getRetryAfterSeconds(resetAt: string): number {
  const resetAtMs = Date.parse(resetAt);
  if (!Number.isFinite(resetAtMs)) return 1;
  const seconds = Math.ceil((resetAtMs - Date.now()) / 1000);
  return Math.max(1, seconds);
}

export function toRateLimitExceededResponse(result: RateLimitCheckResult): NextResponse {
  const retryAfter = getRetryAfterSeconds(result.resetAt);
  return NextResponse.json(
    {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
      action: result.action,
      resetAt: result.resetAt,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': result.resetAt,
        'X-RateLimit-Action': result.action,
        'X-RateLimit-Degraded': result.degraded ? '1' : '0',
      },
    },
  );
}
