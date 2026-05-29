import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: {},
});

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

async function loadSeoHelpers() {
  return import('@/lib/seo');
}

test('SEO app overrides are normalized without allowing bad values to erase fallbacks', async () => {
  const { normalizeSeoOverrides } = await loadSeoHelpers();
  const { seo, issues } = normalizeSeoOverrides(
    {
      title: '  KODE01 launch  ',
      metaDescription: '',
      metaKeywords: [' ai ', '', 'marketplace'],
      canonicalUrl: 'https://www.kode01.com/',
      robots: 'Disallow: /',
      ogType: 'made-up',
      twitterCard: 'summary_large_image',
      schemaJson: 'invalid',
    },
    { fallbackCanonicalPath: '/en' },
  );

  assert.equal(seo.title, 'KODE01 launch');
  assert.deepEqual(seo.metaKeywords, ['ai', 'marketplace']);
  assert.equal(seo.metaDescription, undefined);
  assert.equal(seo.canonicalUrl, 'https://kode01.com/en');
  assert.equal(seo.robots, undefined);
  assert.equal(seo.ogType, undefined);
  assert.equal(seo.twitterCard, 'summary_large_image');
  assert.equal(seo.schemaJson, undefined);
  assert.deepEqual(
    issues.map((issue) => issue.field).sort(),
    ['ogType', 'robots', 'schemaJson'],
  );
});

test('SEO canonical overrides stay on the canonical domain', async () => {
  const { normalizeSeoOverrides } = await loadSeoHelpers();
  const { seo, issues } = normalizeSeoOverrides({
    canonicalUrl: 'https://example.com/steal-canonical',
    schemaJson: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      _blocks: [{ id: 'editor-only' }],
    },
  });

  assert.equal(seo.canonicalUrl, undefined);
  assert.equal(seo.schemaJson?.['@type'], 'WebSite');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'canonicalUrl');
  assert.equal(issues[0].reason, 'external_domain');
});

test('SEO route builders separate app SEO lookup paths from localized canonicals', async () => {
  const {
    buildCanonicalPathname,
    buildSeoPathname,
    isPrivateSeoPath,
  } = await loadSeoHelpers();

  assert.equal(buildSeoPathname('/products/[product_slug]', { locale: 'fr', product_slug: 'agent-kit' }), '/products/agent-kit');
  assert.equal(buildCanonicalPathname('/products/[product_slug]', { locale: 'fr', product_slug: 'agent-kit' }), '/fr/products/agent-kit');
  assert.equal(buildCanonicalPathname('/', { locale: 'en' }), '/en');
  assert.equal(isPrivateSeoPath('/admin/marketing/demo/edit'), true);
  assert.equal(isPrivateSeoPath('/market'), false);
});

test('applySeoMetadata keeps local fallbacks while accepting valid SEO app overrides', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({
      data: {
        title: '',
        metaDescription: 'SEO app description',
        canonicalUrl: 'https://www.kode01.com/',
        twitterCard: 'summary',
      },
    }),
    { status: 200 },
  ));

  try {
    const { applySeoMetadata } = await loadSeoHelpers();
    const metadata = await applySeoMetadata(
      {
        title: 'Local title',
        description: 'Local description',
      },
      '/',
      { locale: 'fr' },
    );

    assert.equal(metadata.title, 'Local title');
    assert.equal(metadata.description, 'SEO app description');
    assert.deepEqual(metadata.alternates, { canonical: 'https://kode01.com/fr' });
    assert.equal(metadata.robots, 'index, follow');
    assert.equal((metadata.twitter as { card?: string } | undefined)?.card, 'summary');
  } finally {
    fetchMock.mock.restore();
  }
});

test('robots and sitemap config allow public crawl while excluding private surfaces', () => {
  const robots = readProjectFile('public/robots.txt');
  const sitemapConfig = readProjectFile('next-sitemap.config.js');

  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Allow: \/api\/blog\/rss$/m);
  assert.match(robots, /^Allow: \/api\/news\/rss$/m);
  assert.doesNotMatch(robots, /^Disallow: \/$/m);
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/api$/m);
  assert.match(robots, /^Sitemap: https:\/\/kode01\.com\/sitemap\.xml$/m);
  assert.match(robots, /^Sitemap: https:\/\/kode01\.com\/server-sitemap\.xml$/m);

  assert.match(sitemapConfig, /BLOCKED_SEGMENTS = \['admin', 'dashboard', 'buyer', 'client', 'vendor', 'settings', 'auth', 'api'\]/);
  assert.match(sitemapConfig, /PUBLIC_ASSET_EXCLUSIONS = \['\/icon\.png'\]/);
  assert.match(sitemapConfig, /PUBLIC_MARKETPLACE_ENABLED/);
  assert.match(sitemapConfig, /MARKETPLACE_STATIC_ROUTES = PUBLIC_MARKETPLACE_ENABLED \? \['\/market', '\/bundles', '\/creators'\] : \[\]/);
  assert.doesNotMatch(sitemapConfig, /'\/products'/);
});

test('blog and news pages expose RSS autodiscovery metadata', () => {
  const blogPage = readProjectFile('src/app/[locale]/blog/page.tsx');
  const newsPage = readProjectFile('src/app/[locale]/(marketing)/news/page.tsx');

  assert.match(blogPage, /'application\/rss\+xml'/);
  assert.match(blogPage, /\/blog\/rss\.xml/);
  assert.match(newsPage, /'application\/rss\+xml'/);
  assert.match(newsPage, /\/news\/rss\.xml/);
});
