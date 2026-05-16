import { getTrustedClientIpFromHeaders } from './request-ip';

export const BOT_FLAG_COOKIE_NAME = 'ds_bot_flag';
const BOT_FLAG_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type HeaderReader = {
  headers: Headers;
  nextUrl?: URL;
};

export function getRequestIpAddress(request: Request | HeaderReader): string {
  return getTrustedClientIpFromHeaders(request.headers) ?? 'unknown';
}

export function buildBotFlagCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: BOT_FLAG_COOKIE_MAX_AGE_SECONDS,
  };
}
