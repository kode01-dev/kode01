import 'server-only';

import { logAuditEvent } from '@/lib/security/audit';

type SeoMetadataField = 'canonicalUrl' | 'robots' | 'ogType' | 'twitterCard' | 'schemaJson';

type LogInvalidSeoMetadataInput = {
  pathname: string;
  field: SeoMetadataField;
  rawValue: string;
  source: 'kodeMetadata' | 'getSeoOverrides';
  reason?: string;
};

const SEO_METADATA_LOG_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const seoMetadataLogTimestamps = new Map<string, number>();

function pruneExpiredDedupeEntries(nowMs: number): void {
  for (const [key, timestamp] of seoMetadataLogTimestamps) {
    if (nowMs - timestamp > SEO_METADATA_LOG_DEDUPE_WINDOW_MS) {
      seoMetadataLogTimestamps.delete(key);
    }
  }
}

function shouldLogInvalidSeoMetadata(input: LogInvalidSeoMetadataInput): boolean {
  const nowMs = Date.now();
  pruneExpiredDedupeEntries(nowMs);

  const normalizedPath = input.pathname.trim() || '/';
  const normalizedRawValue = input.rawValue.trim().toLowerCase();
  const dedupeKey = `${input.source}|${normalizedPath}|${input.field}|${normalizedRawValue}`;
  const lastLoggedAt = seoMetadataLogTimestamps.get(dedupeKey);

  if (lastLoggedAt && nowMs - lastLoggedAt < SEO_METADATA_LOG_DEDUPE_WINDOW_MS) {
    return false;
  }

  seoMetadataLogTimestamps.set(dedupeKey, nowMs);
  return true;
}

export async function logInvalidSeoMetadata(input: LogInvalidSeoMetadataInput): Promise<void> {
  if (!shouldLogInvalidSeoMetadata(input)) {
    return;
  }

  await logAuditEvent({
    eventType: 'seo.metadata.invalid_value',
    path: input.pathname,
    metadata: {
      source: input.source,
      field: input.field,
      raw_value: input.rawValue,
      reason: input.reason,
      action: 'ignored_invalid_value_fallback_applied',
    },
  });
}

