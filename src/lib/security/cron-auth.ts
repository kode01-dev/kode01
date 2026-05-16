import { createHmac, timingSafeEqual } from 'crypto';
import { getServerEnv } from '@/lib/env/server';
import {
  DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS,
  INTERNAL_AUTH_HEADERS,
  verifyInternalAuthHeaders,
} from '@/lib/security/internal-auth';
import { extractBearerToken, isAuthorizedByAnyBearerSecret } from '@/lib/security/bearer';

type JwtPayload = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
};

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function parseSkewSeconds(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS;
  return Math.floor(parsed);
}

function decodeJwtSegment(segment: string): string | null {
  try {
    return Buffer.from(segment, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function isValidJwtSignature(signingInput: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function verifyJwtBearer(
  token: string,
  acceptedSecrets: Array<string | null | undefined>,
  expectedIssuer: string | undefined,
  expectedAudience: string | undefined,
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return false;

  const rawHeader = decodeJwtSegment(encodedHeader);
  const rawPayload = decodeJwtSegment(encodedPayload);
  if (!rawHeader || !rawPayload) return false;

  let header: { alg?: unknown; typ?: unknown };
  let payload: JwtPayload;
  try {
    header = JSON.parse(rawHeader) as { alg?: unknown; typ?: unknown };
    payload = JSON.parse(rawPayload) as JwtPayload;
  } catch {
    return false;
  }

  if (header.alg !== 'HS256') return false;

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  let matchedSecret: string | null = null;
  for (const secret of acceptedSecrets) {
    if (!secret) continue;
    if (isValidJwtSignature(signingInput, signature, secret)) {
      matchedSecret = secret;
      break;
    }
  }
  if (!matchedSecret) return false;

  const exp = typeof payload.exp === 'number' ? payload.exp : Number(payload.exp);
  if (!Number.isFinite(exp)) return false;
  if (Math.floor(Date.now() / 1000) >= Math.floor(exp)) return false;

  if (expectedIssuer && payload.iss !== expectedIssuer) return false;
  if (expectedAudience && payload.aud !== expectedAudience) return false;

  return true;
}

export function isCronAuthorized(req: Request): boolean {
  const env = getServerEnv();
  const acceptedSecrets = [env.CRON_SECRET, env.CRON_SECRET_NEXT];
  if (env.NODE_ENV === 'production' && !env.CRON_SECRET && !env.CRON_SECRET_NEXT) {
    throw new Error('CRON_SECRET (or CRON_SECRET_NEXT) is required in production');
  }

  const requireSignature = parseBooleanEnv(
    process.env.CRON_AUTH_REQUIRE_SIGNATURE,
    env.NODE_ENV === 'production',
  );

  if (requireSignature) {
    const url = new URL(req.url);
    const verification = verifyInternalAuthHeaders({
      method: req.method,
      path: url.pathname,
      authorizationHeader: req.headers.get('authorization'),
      signatureHeader: req.headers.get(INTERNAL_AUTH_HEADERS.signature),
      timestampHeader: req.headers.get(INTERNAL_AUTH_HEADERS.timestamp),
      nonceHeader: req.headers.get(INTERNAL_AUTH_HEADERS.nonce),
      acceptedSecrets,
      maxSkewSeconds: parseSkewSeconds(process.env.CRON_AUTH_MAX_SKEW_SECONDS),
    });
    return verification.ok;
  }

  const authorizationHeader = req.headers.get('authorization');
  if (isAuthorizedByAnyBearerSecret(authorizationHeader, acceptedSecrets)) {
    return true;
  }

  const bearerToken = extractBearerToken(authorizationHeader);
  if (!bearerToken) return false;

  return verifyJwtBearer(
    bearerToken,
    acceptedSecrets,
    process.env.CRON_JWT_ISSUER?.trim() || undefined,
    process.env.CRON_JWT_AUDIENCE?.trim() || undefined,
  );
}
