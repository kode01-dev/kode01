import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: {},
});

async function loadSeoHelpers() {
  return import('@/lib/seo');
}

test('KodeJsonLd serializes SEO schema without script tag breakouts', async () => {
  const maliciousName = '</script><script>alert(1)</script>';
  const description = 'A & B\u2028C\u2029D';
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({
      data: {
        schemaJson: {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: maliciousName,
          description,
        },
      },
    }),
    { status: 200 },
  ));

  try {
    const { KodeJsonLd } = await loadSeoHelpers();
    const element = await KodeJsonLd({ path: '/unsafe-schema' });
    assert.ok(element);

    const html = (element as {
      props: { dangerouslySetInnerHTML: { __html: string } };
    }).props.dangerouslySetInnerHTML.__html;

    assert.equal(html.includes('</script>'), false);
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('&'), false);
    assert.equal(html.includes('\u2028'), false);
    assert.equal(html.includes('\u2029'), false);
    assert.equal(html.includes('\\u003c/script\\u003e\\u003cscript\\u003e'), true);
    assert.equal(html.includes('\\u0026'), true);
    assert.equal(html.includes('\\u2028'), true);
    assert.equal(html.includes('\\u2029'), true);

    const parsed = JSON.parse(html) as { name: string; description: string };
    assert.equal(parsed.name, maliciousName);
    assert.equal(parsed.description, description);
  } finally {
    fetchMock.mock.restore();
  }
});
