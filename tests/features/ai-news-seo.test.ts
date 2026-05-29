import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { AiNewsNewsletterCta } from '@/features/ai-recap/components/AiNewsNewsletterCta';
import {
  buildNewsArticleToc,
  getRenderableNewsArticleToc,
  parseNewsArticleMarkdown,
  renderNewsArticleBlocks,
} from '@/features/ai-recap/lib/news-article-markdown';
import {
  buildNewsArticleJsonLd,
  buildNewsLocalePathnames,
  resolveNewsPostLocale,
} from '@/features/ai-recap/lib/news-detail-seo';
import type { RecapPostDetail } from '@/features/ai-recap/types';

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  children?: React.ReactNode;
}>;

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function makePost(overrides: Partial<RecapPostDetail> = {}): RecapPostDetail {
  return {
    id: 'post-1',
    edition_id: 'edition-1',
    locale: 'en',
    slug: 'ai-news',
    title: 'AI News Title',
    intro: 'Intro',
    excerpt: 'Excerpt',
    tags: ['AI'],
    published_at: '2026-05-01T12:00:00.000Z',
    content_markdown: '## One',
    content_json: null,
    ...overrides,
  };
}

test('AI News sitemap uses each post locale instead of duplicating slugs across locales', () => {
  const sitemapRoute = readProjectFile('src/app/server-sitemap.xml/route.ts');
  const recapSection = sitemapRoute.slice(
    sitemapRoute.indexOf('if (recapPosts)'),
    sitemapRoute.indexOf('if (editorialPosts)'),
  );

  assert.match(sitemapRoute, /\.select\('locale, slug, published_at, created_at'\)/);
  assert.match(recapSection, /\$\{siteUrl\}\/\$\{item\.locale\}\/news\/\$\{item\.slug\}/);
  assert.doesNotMatch(recapSection, /locales\.forEach/);
});

test('AI News locale resolution redirects wrong-locale slugs to the canonical post locale', () => {
  const exactPost = makePost({ locale: 'fr', slug: 'news-fr' });
  assert.deepEqual(
    resolveNewsPostLocale({
      requestedLocale: 'fr',
      requestedSlug: 'news-fr',
      exactPost,
      canonicalPost: null,
    }),
    { type: 'render', post: exactPost },
  );

  assert.deepEqual(
    resolveNewsPostLocale({
      requestedLocale: 'fr',
      requestedSlug: 'news-en',
      exactPost: null,
      canonicalPost: makePost({ locale: 'en', slug: 'news-en' }),
    }),
    { type: 'redirect', href: '/en/news/news-en' },
  );

  assert.deepEqual(
    resolveNewsPostLocale({
      requestedLocale: 'fr',
      requestedSlug: 'missing',
      exactPost: null,
      canonicalPost: null,
    }),
    { type: 'notFound' },
  );
});

test('AI News language switcher uses sibling slugs for alternate locales', () => {
  assert.deepEqual(
    buildNewsLocalePathnames(
      makePost({ locale: 'en', slug: 'ai-weekly-recap-2026-w20-fri' }),
      [
        makePost({
          id: 'post-2',
          locale: 'fr',
          slug: 'recap-hebdo-ia-2026-s20-ven',
        }),
      ],
    ),
    {
      en: '/news/ai-weekly-recap-2026-w20-fri',
      fr: '/news/recap-hebdo-ia-2026-s20-ven',
    },
  );
});

test('AI News detail passes alternate locale paths to the header switcher', () => {
  const newsDetailPage = readProjectFile('src/app/[locale]/(marketing)/news/[slug]/page.tsx');

  assert.match(newsDetailPage, /buildNewsLocalePathnames\(post, siblingPosts\)/);
  assert.match(newsDetailPage, /<BaseHeader localePathnames={newsLocalePathnames} \/>/);
});

test('AI News JSON-LD fallback includes Article and BreadcrumbList', () => {
  const jsonLd = buildNewsArticleJsonLd({
    baseUrl: 'https://kode01.com',
    locale: 'fr',
    post: makePost({ locale: 'fr', slug: 'veille-ia', title: 'Veille IA' }),
    homeLabel: 'Accueil',
    newsLabel: 'News IA',
  }) as Array<{
    '@type': string;
    mainEntityOfPage?: string;
    itemListElement?: Array<{ name: string }>;
  }>;

  assert.equal(jsonLd[0]['@type'], 'Article');
  assert.equal(jsonLd[0].mainEntityOfPage, 'https://kode01.com/fr/news/veille-ia');
  assert.equal(jsonLd[1]['@type'], 'BreadcrumbList');
  assert.deepEqual(
    jsonLd[1].itemListElement?.map((item) => item.name),
    ['Accueil', 'News IA', 'Veille IA'],
  );
});

test('AI News article renderer creates a visible TOC only for 3+ headings with stable duplicate anchors', () => {
  const twoHeadingBlocks = parseNewsArticleMarkdown('## First\n\nText\n\n## Second\n\nText', 'Article title');
  assert.equal(getRenderableNewsArticleToc(buildNewsArticleToc(twoHeadingBlocks)).length, 0);

  const blocks = parseNewsArticleMarkdown('## Alpha\n\nText\n\n### Alpha\n\nText\n\n## Beta\n\nText', 'Article title');
  const allTocItems = buildNewsArticleToc(blocks);
  const tocItems = getRenderableNewsArticleToc(allTocItems);

  assert.deepEqual(
    tocItems.map((item) => item.id),
    ['alpha', 'alpha-2', 'beta'],
  );

  const markup = renderToStaticMarkup(renderNewsArticleBlocks(blocks, allTocItems));
  assert.match(markup, /id="alpha"/);
  assert.match(markup, /id="alpha-2"/);
  assert.match(markup, /id="beta"/);
});

test('AI News newsletter CTA renders localized copy and posts to the newsletter endpoint', () => {
  const componentSource = readProjectFile('src/features/ai-recap/components/AiNewsNewsletterCta.tsx');
  assert.match(componentSource, /\/api\/newsletter\/subscribe/);
  assert.match(componentSource, /type="email"/);
  assert.match(componentSource, /newsletter_cta_success/);
  assert.match(componentSource, /newsletter_cta_error/);

  const markup = renderToStaticMarkup(
    React.createElement(
      TestIntlProvider,
      {
        locale: 'en',
        messages: {
          artifacts_home: {
            news: {
              newsletter_cta_label: 'AI News newsletter',
              newsletter_cta_title: 'Get the next AI brief in your inbox',
              newsletter_cta_subtitle: 'Receive the next thematic AI update.',
              newsletter_cta_email_label: 'Email address',
              newsletter_cta_email_placeholder: 'you@example.com',
              newsletter_cta_button: 'Subscribe',
              newsletter_cta_loading: 'Subscribing...',
              newsletter_cta_success: 'You are subscribed.',
              newsletter_cta_error: 'Unable to subscribe right now.',
            },
          },
        },
      },
      React.createElement(AiNewsNewsletterCta),
    ),
  );

  assert.match(markup, /Get the next AI brief in your inbox/);
  assert.match(markup, /you@example\.com/);
  assert.match(markup, /Subscribe/);
});
