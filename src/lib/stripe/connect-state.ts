import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '@/lib/env/server';

const STATE_VERSION = 1;
const STATE_TTL_MS = 10 * 60 * 1000;

export const STRIPE_CONNECT_STATE_SECRET_ERROR = 'stripe_connect_state_secret_required';

export class StripeConnectStateSecretError extends Error {
  readonly code = STRIPE_CONNECT_STATE_SECRET_ERROR;
  readonly publicMessage =
    'Stripe Connect secure state is not configured. Set STRIPE_CONNECT_STATE_SECRET.';
}

export type StripeConnectStatePurpose = 'vendor_onboarding';

export type StripeConnectStatePayload = {
  version: number;
  userId: string;
  stripeAccountId: string;
  locale: string;
  purpose: StripeConnectStatePurpose;
  createdAt: number;
  nonce: string;
};

type VerifyStripeConnectStateOptions = {
  expectedUserId?: string;
  expectedStripeAccountId?: string;
  expectedPurpose?: StripeConnectStatePurpose;
  now?: number;
};

export type VerifyStripeConnectStateResult =
  | { ok: true; payload: StripeConnectStatePayload }
  | {
      ok: false;
      reason:
        | 'missing_state'
        | 'malformed_state'
        | 'missing_secret'
        | 'signature_mismatch'
        | 'expired'
        | 'wrong_user'
        | 'wrong_account'
        | 'wrong_purpose';
    };

function getStateSecret(): string {
  const secret = getServerEnv().STRIPE_CONNECT_STATE_SECRET?.trim();
  if (!secret) {
    throw new StripeConnectStateSecretError();
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function isPayloadShape(value: unknown): value is StripeConnectStatePayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StripeConnectStatePayload>;
  return (
    candidate.version === STATE_VERSION &&
    typeof candidate.userId === 'string' &&
    typeof candidate.stripeAccountId === 'string' &&
    typeof candidate.locale === 'string' &&
    candidate.purpose === 'vendor_onboarding' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.nonce === 'string'
  );
}

export function createStripeConnectState(
  input: Pick<StripeConnectStatePayload, 'userId' | 'stripeAccountId' | 'locale' | 'purpose'>,
  now = Date.now(),
): string {
  const payload: StripeConnectStatePayload = {
    ...input,
    version: STATE_VERSION,
    createdAt: now,
    nonce: randomBytes(16).toString('base64url'),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, getStateSecret());

  return `${encodedPayload}.${signature}`;
}

export function verifyStripeConnectState(
  state: string | null | undefined,
  options: VerifyStripeConnectStateOptions = {},
): VerifyStripeConnectStateResult {
  if (!state) return { ok: false, reason: 'missing_state' };

  const [encodedPayload, signature, extra] = state.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false, reason: 'malformed_state' };
  }

  let expectedSignature: string;
  try {
    expectedSignature = signPayload(encodedPayload, getStateSecret());
  } catch {
    return { ok: false, reason: 'missing_secret' };
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed_state' };
  }

  if (!isPayloadShape(parsed)) {
    return { ok: false, reason: 'malformed_state' };
  }

  const now = options.now ?? Date.now();
  if (parsed.createdAt > now || now - parsed.createdAt > STATE_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }

  if (options.expectedUserId && parsed.userId !== options.expectedUserId) {
    return { ok: false, reason: 'wrong_user' };
  }

  if (options.expectedStripeAccountId && parsed.stripeAccountId !== options.expectedStripeAccountId) {
    return { ok: false, reason: 'wrong_account' };
  }

  if (options.expectedPurpose && parsed.purpose !== options.expectedPurpose) {
    return { ok: false, reason: 'wrong_purpose' };
  }

  return { ok: true, payload: parsed };
}
