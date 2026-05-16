export const DEFAULT_VENDOR_BUSINESS_URL = 'https://www.kode01.com';
export const DEFAULT_VENDOR_BUSINESS_DESCRIPTION = 'Digital assets and tools marketplace';
export const DEFAULT_VENDOR_BUSINESS_MCC = '5817';

export function getDefaultVendorBusinessDescriptionForLocale(locale: string | undefined): string {
  if ((locale ?? '').trim().toLowerCase() === 'fr') {
    return 'Marketplace d actifs numeriques et outils';
  }

  return DEFAULT_VENDOR_BUSINESS_DESCRIPTION;
}

export function normalizeVendorBusinessUrl(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_VENDOR_BUSINESS_URL;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Fall through to default.
  }

  return DEFAULT_VENDOR_BUSINESS_URL;
}

export function normalizeVendorBusinessDescription(
  value: string | null | undefined,
  fallback: string = DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  return candidate.slice(0, 500);
}

export function normalizeVendorBusinessMcc(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (candidate && /^\d{4}$/.test(candidate)) {
    return candidate;
  }

  return DEFAULT_VENDOR_BUSINESS_MCC;
}
