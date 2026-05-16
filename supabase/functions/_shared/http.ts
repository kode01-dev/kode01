import { getEdgeEnv } from './env.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

export function badRequest(message = 'Bad Request') {
  return json({ error: message }, 400);
}

export function unauthorized(message = 'Unauthorized') {
  return json({ error: message }, 401);
}

export function forbidden(message = 'Forbidden') {
  return json({ error: message }, 403);
}

export function internalServerError(message = 'Internal Server Error') {
  return json({ error: message }, 500);
}

export function methodNotAllowed() {
  return json({ error: 'Method Not Allowed' }, 405);
}

export async function safeJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function timingSafeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function matchesAnyToken(candidate: string, secrets: Array<string | undefined>): boolean {
  if (!candidate) return false;
  return secrets.some((secret) => Boolean(secret) && timingSafeCompare(candidate, secret as string));
}

function isInternalTokenEnforced(
  edgeInternalAuthToken: string | undefined,
  edgeInternalAuthTokenNext: string | undefined,
): boolean {
  return Boolean(edgeInternalAuthToken || edgeInternalAuthTokenNext);
}

export function isInternalAuthorized(req: Request) {
  const env = getEdgeEnv();
  const token = extractBearerToken(req.headers.get('authorization'));
  const internalToken = req.headers.get('x-internal-auth') ?? '';

  const authMatchesServiceRole = matchesAnyToken(token, [env.supabaseServiceRoleKey]);
  const authMatchesInternalToken =
    matchesAnyToken(internalToken, [env.edgeInternalAuthToken, env.edgeInternalAuthTokenNext]);

  if (isInternalTokenEnforced(env.edgeInternalAuthToken, env.edgeInternalAuthTokenNext)) {
    return authMatchesInternalToken;
  }

  return authMatchesServiceRole || authMatchesInternalToken;
}

export function isCronAuthorized(req: Request) {
  const env = getEdgeEnv();
  if (isInternalAuthorized(req)) return true;
  if (!env.cronSecret && !env.cronSecretNext) return false;

  const token = extractBearerToken(req.headers.get('authorization'));
  return matchesAnyToken(token, [env.cronSecret, env.cronSecretNext]);
}
