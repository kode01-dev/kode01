import { timingSafeEquals } from '@/lib/security/bearer';

type ConfiguredAdminApiKey = {
  id: string;
  value: string;
  scopes: string[];
};

export type AdminApiKeyScopeCheck = {
  requiredScope: string;
  provided: boolean;
  granted: boolean;
  keyId: string | null;
  reason:
    | 'not_provided'
    | 'enforced_missing'
    | 'missing_configuration'
    | 'invalid_key'
    | 'insufficient_scope'
    | 'valid';
};

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return defaultValue;
}

function normalizeScope(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function parseScopeList(raw: string | undefined, fallbackScope: string): string[] {
  const parsed = raw
    ?.split(',')
    .map((entry) => normalizeScope(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (parsed && parsed.length > 0) return [...new Set(parsed)];
  return [fallbackScope];
}

function parseJsonConfiguredKeys(raw: string | undefined): ConfiguredAdminApiKey[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const keys: ConfiguredAdminApiKey[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as {
        id?: unknown;
        key?: unknown;
        scopes?: unknown;
      };
      if (typeof record.key !== 'string' || record.key.trim().length === 0) continue;
      const id =
        typeof record.id === 'string' && record.id.trim().length > 0
          ? record.id.trim().toLowerCase()
          : `json-${keys.length + 1}`;
      const scopes = Array.isArray(record.scopes)
        ? record.scopes
          .map((scope) => (typeof scope === 'string' ? normalizeScope(scope) : null))
          .filter((scope): scope is string => Boolean(scope))
        : [];

      keys.push({
        id,
        value: record.key.trim(),
        scopes: scopes.length > 0 ? [...new Set(scopes)] : ['admin.api'],
      });
    }
    return keys;
  } catch {
    return [];
  }
}

function getConfiguredAdminApiKeys(): ConfiguredAdminApiKey[] {
  const primary = process.env.ADMIN_API_KEY?.trim();
  const secondary = process.env.ADMIN_API_KEY_NEXT?.trim();
  const configured: ConfiguredAdminApiKey[] = [];

  if (primary) {
    configured.push({
      id: 'primary',
      value: primary,
      scopes: parseScopeList(process.env.ADMIN_API_KEY_SCOPES, 'admin.api'),
    });
  }

  if (secondary) {
    configured.push({
      id: 'next',
      value: secondary,
      scopes: parseScopeList(process.env.ADMIN_API_KEY_NEXT_SCOPES, 'admin.api'),
    });
  }

  configured.push(...parseJsonConfiguredKeys(process.env.ADMIN_API_KEYS_JSON));

  return configured;
}

function readProvidedAdminApiKey(request: Request | undefined): string | null {
  if (!request) return null;
  const fromHeader = request.headers.get('x-admin-api-key')?.trim();
  return fromHeader && fromHeader.length > 0 ? fromHeader : null;
}

function scopeMatches(requiredScope: string, grantedScope: string): boolean {
  if (grantedScope === '*') return true;
  if (grantedScope.endsWith('.*')) {
    const prefix = grantedScope.slice(0, -2);
    return requiredScope === prefix || requiredScope.startsWith(`${prefix}.`);
  }
  return requiredScope === grantedScope;
}

function isScopeGranted(requiredScope: string, grantedScopes: string[]): boolean {
  return grantedScopes.some((scope) => scopeMatches(requiredScope, scope));
}

export function isAdminApiKeyEnforced(): boolean {
  return parseBooleanEnv(process.env.ADMIN_API_KEY_ENFORCE, false);
}

export function evaluateAdminApiKeyScope(
  request: Request | undefined,
  requiredScopeInput: string | undefined,
): AdminApiKeyScopeCheck {
  const requiredScope = normalizeScope(requiredScopeInput) ?? 'admin.api';
  const providedKey = readProvidedAdminApiKey(request);
  const enforced = isAdminApiKeyEnforced();

  if (!providedKey) {
    if (enforced) {
      return {
        requiredScope,
        provided: false,
        granted: false,
        keyId: null,
        reason: 'enforced_missing',
      };
    }

    return {
      requiredScope,
      provided: false,
      granted: true,
      keyId: null,
      reason: 'not_provided',
    };
  }

  const configuredKeys = getConfiguredAdminApiKeys();
  if (configuredKeys.length === 0) {
    return {
      requiredScope,
      provided: true,
      granted: false,
      keyId: null,
      reason: 'missing_configuration',
    };
  }

  const matchedKey = configuredKeys.find((candidate) => timingSafeEquals(providedKey, candidate.value));
  if (!matchedKey) {
    return {
      requiredScope,
      provided: true,
      granted: false,
      keyId: null,
      reason: 'invalid_key',
    };
  }

  if (!isScopeGranted(requiredScope, matchedKey.scopes)) {
    return {
      requiredScope,
      provided: true,
      granted: false,
      keyId: matchedKey.id,
      reason: 'insufficient_scope',
    };
  }

  return {
    requiredScope,
    provided: true,
    granted: true,
    keyId: matchedKey.id,
    reason: 'valid',
  };
}
