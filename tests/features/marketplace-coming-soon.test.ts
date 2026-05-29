import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

test('public marketplace flag is disabled for the coming-soon launch state', () => {
  const config = JSON.parse(readProjectFile('config/public-marketplace.json')) as {
    PUBLIC_MARKETPLACE_ENABLED?: unknown;
  };

  assert.equal(config.PUBLIC_MARKETPLACE_ENABLED, false);
});

test('/market renders a localized coming-soon page without loading marketplace results', () => {
  const marketPage = readProjectFile('src/app/[locale]/(marketing)/market/page.tsx');

  assert.match(marketPage, /coming_soon\.title/);
  assert.match(marketPage, /coming_soon\.cta_news/);
  assert.match(marketPage, /coming_soon\.cta_blog/);
  assert.match(marketPage, /robots: 'noindex, nofollow'/);
  assert.doesNotMatch(marketPage, /MarketPage/);
  assert.doesNotMatch(marketPage, /getMarketListDataCached/);
});

test('public menus keep a disabled marketplace coming-soon label', () => {
  const desktopNav = readProjectFile('src/components/layout/base-header/BaseHeaderDesktopNav.tsx');
  const mobileNav = readProjectFile('src/components/layout/base-header/BaseHeaderMobileMenu.tsx');

  assert.match(desktopNav, /nav\.marketplace_coming_soon/);
  assert.match(desktopNav, /aria-disabled="true"/);
  assert.match(mobileNav, /nav\.marketplace_coming_soon/);
  assert.match(mobileNav, /aria-disabled="true"/);
});

test('public sitemap output excludes marketplace launch surfaces while flag is off', () => {
  const staticSitemap = readProjectFile('public/sitemap-0.xml');
  const serverSitemapRoute = readProjectFile('src/app/server-sitemap.xml/route.ts');

  assert.doesNotMatch(staticSitemap, /\/market/);
  assert.doesNotMatch(staticSitemap, /\/bundles/);
  assert.doesNotMatch(staticSitemap, /\/creators/);
  assert.match(serverSitemapRoute, /PUBLIC_MARKETPLACE_ENABLED/);
});
