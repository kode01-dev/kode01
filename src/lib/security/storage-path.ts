const STORAGE_PATH_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function sanitizeStorageObjectPath(rawPath: string | null | undefined): string | null {
  if (typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.includes('\u0000')) return null;
  if (STORAGE_PATH_SCHEME_PATTERN.test(normalized)) return null;

  const segments = normalized.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null;
  }

  return segments.join('/');
}
