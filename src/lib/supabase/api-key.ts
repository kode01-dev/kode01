export function normalizeSupabaseApiKey(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return trimmed;

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, '').trim();
  if (!withoutBearer) return withoutBearer;

  const jwtLikeMatch = withoutBearer.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (jwtLikeMatch?.[0]) {
    return jwtLikeMatch[0];
  }

  return withoutBearer.replace(/\s+/g, '');
}
