import { NextRequest, NextResponse } from 'next/server';
import { isBlockedBotUserAgent } from './bot-detection';
import { BOT_FLAG_COOKIE_NAME, buildBotFlagCookieOptions, getRequestIpAddress } from './bot-request';
import { isIpWhitelisted } from './whitelist';

function buildBlockedResponse(isApiRequest: boolean): NextResponse {
  if (isApiRequest) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        code: 'BOT_BLOCKED',
      },
      { status: 403 },
    );
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export function applyProxyBotProtection(request: NextRequest): NextResponse | null {
  const requesterIp = getRequestIpAddress(request);

  // Skip security checks for whitelisted IPs
  if (isIpWhitelisted(requesterIp)) {
    return null;
  }

  const isApiRequest = request.nextUrl.pathname.startsWith('/api');
  const flaggedAsBot = request.cookies.get(BOT_FLAG_COOKIE_NAME)?.value === '1';

  if (flaggedAsBot) {
    return buildBlockedResponse(isApiRequest);
  }

  const userAgent = request.headers.get('user-agent');
  if (!isBlockedBotUserAgent(userAgent)) {
    return null;
  }

  const response = buildBlockedResponse(isApiRequest);
  response.cookies.set(BOT_FLAG_COOKIE_NAME, '1', buildBotFlagCookieOptions());
  return response;
}
