import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecapArticleSources } from '@/features/ai-recap/components/RecapArticleSources';
import { getRecapArticleSources } from '@/features/ai-recap/lib/article-sources';
import { stripTrailingGeneratedSourceCredit } from '@/features/ai-recap/lib/markdown-source-cleanup';
import type { RecapContent } from '@/features/ai-recap/types';

function makeContent(overrides: Partial<RecapContent> = {}): RecapContent {
  return {
    title: 'AI recap',
    introduction: 'Intro',
    bigNews: {
      name: 'Launch',
      impact: 'Impact',
      source_url: 'https://big-news.test/story',
    },
    quickHits: [
      {
        topic: 'Quick hit',
        summary: 'Summary',
        source_url: 'https://quick-hit.test/item',
      },
    ],
    lookingAhead: 'Next',
    ...overrides,
  };
}

test('getRecapArticleSources uses source manifest first, deduplicates, and rejects unsafe URLs', () => {
  const content = makeContent({
    source_manifest: {
      used_source_urls: [
        ' https://source-one.test/story?utm_source=feed#section ',
        'javascript:alert(1)',
        'https://source-two.test/report',
        'https://source-one.test/story',
        'ftp://source-three.test/file',
      ],
    },
    summary30s: {
      fr: {
        bullets: ['FR'],
        primary_source_url: 'https://summary-primary.test/fr',
        source_urls: ['https://summary-only.test/fr'],
      },
      en: {
        bullets: ['EN'],
        primary_source_url: 'https://summary-primary.test/en',
        source_urls: ['https://summary-only.test/en'],
      },
    },
    sourceStories: [
      {
        source_url: 'https://source-one.test/story',
        source_name: 'Source One',
        title: 'Source One Story',
      },
      {
        source_url: 'https://source-two.test/report',
        source_name: 'Source Two',
      },
    ],
  });

  const sources = getRecapArticleSources(content, 'fr');

  assert.deepEqual(
    sources.map((source) => source.url),
    ['https://source-one.test/story?utm_source=feed', 'https://source-two.test/report'],
  );
  assert.deepEqual(
    sources.map((source) => source.label),
    ['Source One Story', 'Source Two'],
  );
});

test('getRecapArticleSources falls back to locale summary sources when no manifest sources are valid', () => {
  const content = makeContent({
    source_manifest: {
      used_source_urls: ['not-a-url'],
    },
    summary30s: {
      fr: {
        bullets: ['FR'],
        primary_source_url: 'https://summary-primary.test/fr',
        source_urls: ['https://summary-source.test/fr'],
      },
      en: {
        bullets: ['EN'],
        primary_source_url: 'https://summary-primary.test/en',
        source_urls: ['https://summary-source.test/en'],
      },
    },
  });

  assert.deepEqual(
    getRecapArticleSources(content, 'fr').map((source) => source.url),
    ['https://summary-source.test/fr'],
  );
  assert.deepEqual(
    getRecapArticleSources(content, 'en').map((source) => source.url),
    ['https://summary-source.test/en'],
  );
});

test('RecapArticleSources renders all expected sources for French and English summaries', () => {
  const content = makeContent({
    summary30s: {
      fr: {
        bullets: ['FR'],
        primary_source_url: 'https://summary-primary.test/fr',
        source_urls: ['https://render-source.test/fr', 'https://shared-source.test/story'],
      },
      en: {
        bullets: ['EN'],
        primary_source_url: 'https://summary-primary.test/en',
        source_urls: ['https://render-source.test/en', 'https://shared-source.test/story'],
      },
    },
  });

  const frMarkup = renderToStaticMarkup(React.createElement(RecapArticleSources, { content, locale: 'fr' }));
  const enMarkup = renderToStaticMarkup(React.createElement(RecapArticleSources, { content, locale: 'en' }));

  assert.match(frMarkup, /Sources/);
  assert.match(frMarkup, /https:\/\/render-source\.test\/fr/);
  assert.match(frMarkup, /https:\/\/shared-source\.test\/story/);
  assert.doesNotMatch(frMarkup, /https:\/\/render-source\.test\/en/);

  assert.match(enMarkup, /Sources/);
  assert.match(enMarkup, /https:\/\/render-source\.test\/en/);
  assert.match(enMarkup, /https:\/\/shared-source\.test\/story/);
  assert.doesNotMatch(enMarkup, /https:\/\/render-source\.test\/fr/);
});

test('stripTrailingGeneratedSourceCredit removes only generated source credits at the end', () => {
  const markdown = [
    '# Recap IA',
    '',
    'Le contenu principal reste visible.',
    '',
    '*Sources : OpenAI — Artificial Intelligence News / Deloitte*',
    '',
  ].join('\n');

  assert.equal(
    stripTrailingGeneratedSourceCredit(markdown),
    '# Recap IA\n\nLe contenu principal reste visible.',
  );

  assert.equal(
    stripTrailingGeneratedSourceCredit('Sources : ce passage fait partie du corps.\n\nSuite de l article.'),
    'Sources : ce passage fait partie du corps.\n\nSuite de l article.',
  );
});
