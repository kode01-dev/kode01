export type ConnectCountryOption = {
  code: string;
  label: string;
};

const CONNECT_COUNTRY_OPTIONS: ConnectCountryOption[] = [
  { code: 'AT', label: 'Austria' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'CA', label: 'Canada' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'CY', label: 'Cyprus' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'DE', label: 'Germany' },
  { code: 'DK', label: 'Denmark' },
  { code: 'EE', label: 'Estonia' },
  { code: 'ES', label: 'Spain' },
  { code: 'FI', label: 'Finland' },
  { code: 'FR', label: 'France' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'GR', label: 'Greece' },
  { code: 'HR', label: 'Croatia' },
  { code: 'HU', label: 'Hungary' },
  { code: 'IE', label: 'Ireland' },
  { code: 'IS', label: 'Iceland' },
  { code: 'IT', label: 'Italy' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'LV', label: 'Latvia' },
  { code: 'MT', label: 'Malta' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'NO', label: 'Norway' },
  { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'RO', label: 'Romania' },
  { code: 'SE', label: 'Sweden' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'US', label: 'United States' },
];

export const STRIPE_CONNECT_COUNTRY_OPTIONS = CONNECT_COUNTRY_OPTIONS;

const ALLOWED_CONNECT_COUNTRY_CODES = new Set(CONNECT_COUNTRY_OPTIONS.map((country) => country.code));

export function normalizeConnectCountryCode(input: string | null | undefined): string | null {
  const normalized = input?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isAllowedConnectCountryCode(input: string | null | undefined): boolean {
  const normalized = normalizeConnectCountryCode(input);
  if (!normalized) return false;
  return ALLOWED_CONNECT_COUNTRY_CODES.has(normalized);
}

export function parseAllowedConnectCountryCode(input: string | null | undefined): string | null {
  const normalized = normalizeConnectCountryCode(input);
  if (!normalized) return null;
  return ALLOWED_CONNECT_COUNTRY_CODES.has(normalized) ? normalized : null;
}

export function getConnectCountryLabel(code: string): string {
  const normalized = code.toUpperCase();
  return STRIPE_CONNECT_COUNTRY_OPTIONS.find((country) => country.code === normalized)?.label ?? normalized;
}
