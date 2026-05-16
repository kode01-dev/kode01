type AuthMethodEntry = {
  method?: string | null;
};

const MFA_AUTH_METHODS = new Set(['mfa', 'totp', 'phone', 'webauthn']);

function normalizeMethod(method: string): string {
  return method.trim().toLowerCase();
}

function readMethod(entry: unknown): string | null {
  if (typeof entry === 'string') {
    const normalized = normalizeMethod(entry);
    return normalized.length > 0 ? normalized : null;
  }

  if (entry && typeof entry === 'object') {
    const candidate = (entry as AuthMethodEntry).method;
    if (typeof candidate === 'string') {
      const normalized = normalizeMethod(candidate);
      return normalized.length > 0 ? normalized : null;
    }
  }

  return null;
}

export function isMfaMethod(method: string): boolean {
  return MFA_AUTH_METHODS.has(normalizeMethod(method));
}

export function hasVerifiedMfaMethod(methods: unknown): boolean {
  if (!Array.isArray(methods)) return false;

  return methods.some((entry) => {
    const method = readMethod(entry);
    return method ? isMfaMethod(method) : false;
  });
}

export function isAal2(currentLevel: string | null | undefined): boolean {
  return typeof currentLevel === 'string' && currentLevel.toLowerCase() === 'aal2';
}
