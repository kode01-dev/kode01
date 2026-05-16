export const EDITORIAL_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-');
}

export function slugifyTitle(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .toLowerCase();

  return ascii
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidEditorialSlug(slug: string): boolean {
  return EDITORIAL_SLUG_REGEX.test(slug);
}
