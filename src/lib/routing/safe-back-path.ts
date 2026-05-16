export function resolveSafeBackPath(value: string | undefined, locale: string): string | null {
  if (!value) return null;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  if (!decoded.startsWith('/')) return null;
  if (decoded.startsWith('//')) return null;

  const localePrefix = `/${locale}`;
  return decoded === localePrefix || decoded.startsWith(`${localePrefix}/`) ? decoded : null;
}
