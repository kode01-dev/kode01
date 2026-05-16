import { NextResponse } from 'next/server';
import { logBotActivity } from '@/lib/security/bot-activity';
import { BOT_FLAG_COOKIE_NAME, buildBotFlagCookieOptions, getRequestIpAddress } from '@/lib/security/bot-request';
import { logSecurityEvent } from '@/lib/security/security-log';

function getPathWithQuery(urlString: string): string {
  try {
    const url = new URL(urlString);
    return `${url.pathname}${url.search}`;
  } catch {
    return '/api/honeypot';
  }
}

async function trap(request: Request) {
  const userAgent = request.headers.get('user-agent');
  const ipAddress = getRequestIpAddress(request);
  const path = getPathWithQuery(request.url);

  await logBotActivity({
    source: 'honeypot',
    reason: 'honeypot_trip',
    path,
    ipAddress,
    userAgent,
    blocked: true,
    details: {
      method: request.method,
      referer: request.headers.get('referer'),
    },
  });
  await logSecurityEvent({
    eventType: 'security.honeypot_triggered',
    ipAddress,
    userAgent,
    path,
    metadata: {
      method: request.method,
      source: 'honeypot',
    },
  });

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(BOT_FLAG_COOKIE_NAME, '1', buildBotFlagCookieOptions());
  return response;
}

export async function GET(request: Request) {
  return trap(request);
}

export async function POST(request: Request) {
  return trap(request);
}
