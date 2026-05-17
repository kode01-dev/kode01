import { getSeoOverrides } from '@/lib/seo';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';

type SeoAppJsonLdProps = {
  pathname: string;
  fallbackData?: unknown;
  schemaOverrideMode?: SchemaOverrideMode;
};

export type SchemaOverrideMode = 'prefer-seo' | 'prefer-fallback';

function resolveSeoSchema(schemaJson: unknown): unknown {
  if (!schemaJson || typeof schemaJson !== 'object' || Array.isArray(schemaJson)) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _blocks: _, ...rest } = schemaJson as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

function hasRenderableJsonLd(value: unknown): boolean {
  if (!value) return false;

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return false;
}

function firstRenderableJsonLd(...values: unknown[]): unknown {
  return values.find((value) => hasRenderableJsonLd(value)) ?? null;
}

export function resolveSeoAppJsonLd({
  seoSchema,
  fallbackData,
  schemaOverrideMode = 'prefer-seo',
}: {
  seoSchema?: unknown;
  fallbackData?: unknown;
  schemaOverrideMode?: SchemaOverrideMode;
}): unknown {
  return schemaOverrideMode === 'prefer-fallback'
    ? firstRenderableJsonLd(fallbackData, seoSchema)
    : firstRenderableJsonLd(seoSchema, fallbackData);
}

export async function SeoAppJsonLd({
  pathname,
  fallbackData,
  schemaOverrideMode = 'prefer-seo',
}: SeoAppJsonLdProps): Promise<React.JSX.Element | null> {
  const seo = await getSeoOverrides(pathname);
  const seoSchema = resolveSeoSchema(seo.schemaJson);
  const jsonLd = resolveSeoAppJsonLd({ seoSchema, fallbackData, schemaOverrideMode });

  if (!hasRenderableJsonLd(jsonLd)) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForScriptTag(jsonLd) }}
    />
  );
}
