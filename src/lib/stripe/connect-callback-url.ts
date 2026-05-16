import 'server-only';

import { getAppBaseUrl, getServerEnv } from '@/lib/env/server';

export const STRIPE_CONNECT_CALLBACK_HTTPS_ERROR =
  'stripe_connect_callback_https_required';

export class StripeConnectCallbackUrlError extends Error {
  readonly code = STRIPE_CONNECT_CALLBACK_HTTPS_ERROR;
  readonly publicMessage =
    'Stripe Connect requires an HTTPS callback URL. Set STRIPE_CONNECT_CALLBACK_BASE_URL to an HTTPS tunnel or preview URL.';
}

function normalizeHttpsOrigin(candidate: string | undefined): string | null {
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: Request): string | undefined {
  try {
    return new URL(request.url).origin;
  } catch {
    return undefined;
  }
}

export function resolveStripeConnectCallbackBaseUrl(request: Request): string {
  const env = getServerEnv();
  const configuredCallbackUrl = normalizeHttpsOrigin(env.STRIPE_CONNECT_CALLBACK_BASE_URL);
  if (configuredCallbackUrl) return configuredCallbackUrl;

  const requestOrigin = normalizeHttpsOrigin(getRequestOrigin(request));
  if (requestOrigin) return requestOrigin;

  const configuredAppUrl = normalizeHttpsOrigin(getAppBaseUrl());
  if (configuredAppUrl) return configuredAppUrl;

  throw new StripeConnectCallbackUrlError();
}
