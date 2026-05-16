import { timingSafeEqual } from 'crypto';

function asNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  const header = asNonEmpty(authorizationHeader);
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return asNonEmpty(token);
}

export function timingSafeEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = asNonEmpty(a);
  const right = asNonEmpty(b);
  if (!left || !right) return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAuthorizedByAnyBearerSecret(
  authorizationHeader: string | null | undefined,
  secrets: Array<string | null | undefined>,
): boolean {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return false;

  for (const secret of secrets) {
    if (timingSafeEquals(token, secret)) {
      return true;
    }
  }

  return false;
}
