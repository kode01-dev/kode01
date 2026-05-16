import type { HomepageSectionType } from '@/features/homepage-layout/types';

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function createUuidV4(cryptoSource: CryptoLike): string {
  if (typeof cryptoSource.randomUUID === 'function') {
    return cryptoSource.randomUUID();
  }

  if (typeof cryptoSource.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
  }

  throw new Error('Secure random number generator is unavailable.');
}

export function createSectionId(
  type: HomepageSectionType,
  cryptoSource: CryptoLike | undefined = globalThis.crypto as CryptoLike | undefined,
): string {
  if (!cryptoSource) {
    throw new Error('Secure random number generator is unavailable.');
  }
  return `${type}-${createUuidV4(cryptoSource)}`;
}
