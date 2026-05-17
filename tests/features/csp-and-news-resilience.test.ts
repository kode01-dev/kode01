import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

test('CSP strict report-only mode is opt-in', () => {
  const config = readProjectFile('next.config.ts');

  assert.match(config, /CSP_STRICT_REPORT_ONLY,\s*false/);
  assert.doesNotMatch(config, /CSP_STRICT_REPORT_ONLY,\s*!isDev/);
});

test('CSP connect-src allows Google Analytics collection endpoints', () => {
  const config = readProjectFile('next.config.ts');

  assert.match(config, /https:\/\/www\.googletagmanager\.com/);
  assert.match(config, /https:\/\/www\.google-analytics\.com/);
  assert.match(config, /https:\/\/\*\.google-analytics\.com/);
  assert.match(config, /https:\/\/www\.google\.com/);
  assert.match(config, /https:\/\/stats\.g\.doubleclick\.net/);
});

test('Zipchat is controlled by consent-aware controller instead of global layout script', () => {
  const layout = readProjectFile('src/app/[locale]/layout.tsx');
  const providers = readProjectFile('src/components/Providers.tsx');
  const controller = readProjectFile('src/components/zipchat/ZipchatController.tsx');

  assert.doesNotMatch(layout, /app\.zipchat\.ai\/widget\/zipchat\.js/);
  assert.match(providers, /<ZipchatController \/>/);
  assert.match(controller, /hasMarketingConsentInBrowser/);
  assert.match(controller, /OPEN_ZIPCHAT_SUPPORT_EVENT/);
});

test('news index degrades instead of throwing on data load failure', () => {
  const newsPage = readProjectFile('src/app/[locale]/(marketing)/news/page.tsx');

  assert.match(newsPage, /async function loadNewsPageData/);
  assert.match(newsPage, /catch \(error\)/);
  assert.match(newsPage, /unavailable_title/);
  assert.match(newsPage, /unavailable_subtitle/);
});
