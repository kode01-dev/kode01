import { getSeoOverrides } from '@/lib/seo';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';

type SeoAppJsonLdProps = {
  pathname: string;
  fallbackData?: unknown;
};

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

export async function SeoAppJsonLd({
  pathname,
  fallbackData,
}: SeoAppJsonLdProps): Promise<React.JSX.Element | null> {
  const seo = await getSeoOverrides(pathname);
  const seoSchema = resolveSeoSchema(seo.schemaJson);
  const jsonLd = seoSchema ?? fallbackData ?? null;

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
