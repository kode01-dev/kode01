const CONNECT_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'CA',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'US',
] as const;

const CONNECT_COUNTRY_SET = new Set<string>(CONNECT_COUNTRY_CODES);

export function normalizeConnectCountryCode(input: string | null | undefined): string | null {
  const normalized = input?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function parseAllowedConnectCountryCode(input: string | null | undefined): string | null {
  const normalized = normalizeConnectCountryCode(input);
  if (!normalized) return null;
  return CONNECT_COUNTRY_SET.has(normalized) ? normalized : null;
}
