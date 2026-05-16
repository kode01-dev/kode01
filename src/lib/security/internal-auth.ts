import { createHmac, randomUUID } from 'crypto';
import { extractBearerToken, timingSafeEquals } from '@/lib/security/bearer';

export const INTERNAL_AUTH_HEADERS = {
  timestamp: 'x-kode01-internal-timestamp',
  signature: 'x-kode01-internal-signature',
  nonce: 'x-kode01-internal-nonce',
} as const;

export const DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS = 300;

type BuildHeadersInput = {
  method: string;
  path: string;
  secret: string;
  now?: Date;
};

type VerifyHeadersInput = {
  method: string;
  path: string;
  authorizationHeader: string | null | undefined;
  signatureHeader: string | null | undefined;
  timestampHeader: string | null | undefined;
  nonceHeader: string | null | undefined;
  acceptedSecrets: Array<string | null | undefined>;
  now?: Date;
  maxSkewSeconds?: number;
  replayGuard?: (nonce: string, timestamp: number) => boolean;
};

export type InternalAuthVerification =
  | { ok: true; matchedSecret: string }
  | { ok: false; reason: 'missing_headers' | 'invalid_timestamp' | 'timestamp_expired' | 'invalid_bearer' | 'invalid_signature' | 'replayed_nonce' };

export function computeInternalAuthSignature(input: {
  method: string;
  path: string;
  timestamp: number;
  nonce: string;
  secret: string;
}): string {
  const payload = `${input.method.toUpperCase()}\n${input.path}\n${input.timestamp}\n${input.nonce}`;
  return createHmac('sha256', input.secret).update(payload).digest('hex');
}

export function buildInternalAuthHeaders({
  method,
  path,
  secret,
  now = new Date(),
}: BuildHeadersInput): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000);
  const nonce = randomUUID();
  const signature = computeInternalAuthSignature({
    method,
    path,
    timestamp,
    nonce,
    secret,
  });

  return {
    Authorization: `Bearer ${secret}`,
    [INTERNAL_AUTH_HEADERS.timestamp]: String(timestamp),
    [INTERNAL_AUTH_HEADERS.nonce]: nonce,
    [INTERNAL_AUTH_HEADERS.signature]: signature,
  };
}

function parseTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value);
}

export function verifyInternalAuthHeaders({
  method,
  path,
  authorizationHeader,
  signatureHeader,
  timestampHeader,
  nonceHeader,
  acceptedSecrets,
  now = new Date(),
  maxSkewSeconds = DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS,
  replayGuard,
}: VerifyHeadersInput): InternalAuthVerification {
  const signature = signatureHeader?.trim();
  const nonce = nonceHeader?.trim();
  if (!signature || !nonce) {
    return { ok: false, reason: 'missing_headers' };
  }

  const timestamp = parseTimestamp(timestampHeader);
  if (!timestamp) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  const nowTimestamp = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowTimestamp - timestamp) > Math.max(1, maxSkewSeconds)) {
    return { ok: false, reason: 'timestamp_expired' };
  }

  if (replayGuard && replayGuard(nonce, timestamp) === false) {
    return { ok: false, reason: 'replayed_nonce' };
  }

  const bearer = extractBearerToken(authorizationHeader);
  if (!bearer) {
    return { ok: false, reason: 'invalid_bearer' };
  }

  for (const secret of acceptedSecrets) {
    if (!secret || !timingSafeEquals(bearer, secret)) continue;
    const expectedSignature = computeInternalAuthSignature({
      method,
      path,
      timestamp,
      nonce,
      secret,
    });
    if (timingSafeEquals(expectedSignature, signature)) {
      return { ok: true, matchedSecret: secret };
    }
  }

  return { ok: false, reason: 'invalid_signature' };
}
