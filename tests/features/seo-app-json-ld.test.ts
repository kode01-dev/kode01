import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: {},
});

async function loadJsonLdHelpers() {
  return import('@/components/seo/SeoAppJsonLd');
}

test('SeoAppJsonLd resolver prefers SEO app schema by default', async () => {
  const { resolveSeoAppJsonLd } = await loadJsonLdHelpers();
  const seoSchema = { '@context': 'https://schema.org', '@type': 'WebSite' };
  const fallbackData = { '@context': 'https://schema.org', '@type': 'FAQPage' };

  assert.deepEqual(resolveSeoAppJsonLd({ seoSchema, fallbackData }), seoSchema);
});

test('SeoAppJsonLd resolver can prefer local fallback schema for visible FAQ content', async () => {
  const { resolveSeoAppJsonLd } = await loadJsonLdHelpers();
  const seoSchema = { '@context': 'https://schema.org', '@type': 'WebSite' };
  const fallbackData = { '@context': 'https://schema.org', '@type': 'FAQPage' };

  assert.deepEqual(
    resolveSeoAppJsonLd({ seoSchema, fallbackData, schemaOverrideMode: 'prefer-fallback' }),
    fallbackData,
  );
});

test('SeoAppJsonLd resolver falls back to SEO schema when preferred fallback is empty', async () => {
  const { resolveSeoAppJsonLd } = await loadJsonLdHelpers();
  const seoSchema = { '@context': 'https://schema.org', '@type': 'WebSite' };

  assert.deepEqual(
    resolveSeoAppJsonLd({ seoSchema, fallbackData: {}, schemaOverrideMode: 'prefer-fallback' }),
    seoSchema,
  );
});
