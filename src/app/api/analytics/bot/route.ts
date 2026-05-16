import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isBotLikeUserAgent } from '@/lib/security/bot-detection';
import { logBotActivity } from '@/lib/security/bot-activity';
import { BOT_FLAG_COOKIE_NAME, buildBotFlagCookieOptions, getRequestIpAddress } from '@/lib/security/bot-request';
import { logSecurityEvent } from '@/lib/security/security-log';

const payloadSchema = z.object({
  reason: z.string().trim().min(1).max(64),
  path: z.string().trim().min(1).max(500).optional(),
  explicitBot: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent');
  const ipAddress = getRequestIpAddress(request);
  const explicitBot = Boolean(parsed.data.explicitBot);

  if (explicitBot && !isBotLikeUserAgent(userAgent)) {
    await logBotActivity({
      source: 'analytics_bot_endpoint',
      reason: 'explicit_bot_rejected_non_bot_ua',
      path: parsed.data.path ?? new URL(request.url).pathname,
      ipAddress,
      userAgent,
      blocked: false,
      details: {
        explicitBot,
      },
    });
    return NextResponse.json(
      { error: 'explicitBot requires bot-like user agent' },
      { status: 400 },
    );
  }

  await logBotActivity({
    source: 'analytics_bot_endpoint',
    reason: parsed.data.reason,
    path: parsed.data.path ?? new URL(request.url).pathname,
    ipAddress,
    userAgent,
    blocked: explicitBot,
    details: {
      explicitBot,
      ...(parsed.data.details ?? {}),
    },
  });
  await logSecurityEvent({
    eventType: 'security.bot_signal_received',
    ipAddress,
    userAgent,
    path: parsed.data.path ?? new URL(request.url).pathname,
    metadata: {
      reason: parsed.data.reason,
      explicitBot,
    },
  });

  const response = NextResponse.json({ success: true });
  if (explicitBot) {
    response.cookies.set(BOT_FLAG_COOKIE_NAME, '1', buildBotFlagCookieOptions());
  }

  return response;
}
