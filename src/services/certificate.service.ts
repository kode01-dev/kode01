const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_MASK = 31; // 32-char alphabet; bitmask avoids modulo operations.

type RandomValuesProvider = {
  getRandomValues?: Crypto['getRandomValues'];
};

function resolveRandomProvider(provider?: RandomValuesProvider): Required<RandomValuesProvider> {
  const randomProvider = provider ?? globalThis.crypto;
  if (!randomProvider?.getRandomValues) {
    throw new Error('Secure random number generator is unavailable.');
  }
  return randomProvider as Required<RandomValuesProvider>;
}

export function generateAccessCode(provider?: RandomValuesProvider): string {
  const randomBytes = new Uint8Array(ACCESS_CODE_LENGTH);
  resolveRandomProvider(provider).getRandomValues(randomBytes);

  let code = '';
  for (const value of randomBytes) {
    code += ACCESS_CODE_ALPHABET[value & ACCESS_CODE_MASK];
  }

  return code;
}
