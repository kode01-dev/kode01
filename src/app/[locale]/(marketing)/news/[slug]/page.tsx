import { Link } from '@/i18n/routing';
import { notFound, redirect } from 'next/navigation';
import {
  getRecapPostBySlug,
  getRecapPostBySlugAndLocale,
  getSiblingRecapPosts,
} from '@/features/ai-recap/server/repository';
import { getAppBaseUrl } from '@/lib/env/server';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SponsoredPlacementSlot } from '@/components/ads/SponsoredPlacementSlot';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';
import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import { CrossRecommendationsSection } from '@/features/recommendations/components/CrossRecommendationsSection';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { RecapArticleSources } from '@/features/ai-recap/components/RecapArticleSources';
import { AiNewsNewsletterCta } from '@/features/ai-recap/components/AiNewsNewsletterCta';
import { stripTrailingGeneratedSourceCredit } from '@/features/ai-recap/lib/markdown-source-cleanup';
import { buildNewsArticleJsonLd, resolveNewsPostLocale } from '@/features/ai-recap/lib/news-detail-seo';
import {
  buildNewsArticleToc,
  getRenderableNewsArticleToc,
  parseNewsArticleMarkdown,
  renderNewsArticleBlocks,
  type NewsArticleTocItem,
} from '@/features/ai-recap/lib/news-article-markdown';
import type { RecapLocale } from '@/features/ai-recap/types';

function NewsArticleTableOfContents({
  items,
  title,
}: {
  items: NewsArticleTocItem[];
  title: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-labelledby="news-article-toc-title"
      className="mt-5 sm:mt-8 rounded-xl sm:rounded-2xl border border-black/10 bg-white/70 p-3.5 sm:p-5"
    >
      <h2 id="news-article-toc-title" className="text-sm sm:text-base font-serif font-black">
        {title}
      </h2>
      <ol className="mt-3 list-none p-0 space-y-2 text-sm leading-relaxed">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pl-4' : undefined}>
            <a href={`#${item.id}`} className="text-kode01-noir/70 no-underline transition-colors hover:text-kode01-pink">
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getRecapPostBySlugAndLocale(slug, locale as RecapLocale);

  if (!post) {
    return { title: 'Not Found' };
  }

  const baseUrl = getAppBaseUrl();

  return applySeoMetadata({
    title: post.title,
    description: post.excerpt ?? post.intro,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? post.intro,
      type: 'article',
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/news/${post.slug}`,
    },
  }, '/news/[slug]', { locale, slug: post.slug });
}

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug, locale } = await params;
  const requestedLocale = locale as RecapLocale;
  const exactPost = await getRecapPostBySlugAndLocale(slug, requestedLocale);
  const canonicalPost = exactPost ? null : await getRecapPostBySlug(slug);
  const resolution = resolveNewsPostLocale({
    requestedLocale,
    requestedSlug: slug,
    exactPost,
    canonicalPost,
  });

  if (resolution.type === 'redirect') {
    redirect(resolution.href);
  }

  if (resolution.type === 'notFound') {
    notFound();
  }

  const post = resolution.post;
  const t = await getTranslations({ locale, namespace: 'artifacts_home.news' });
  const [siblingPosts, recommendedBlogResult] = await Promise.all([
    getSiblingRecapPosts(post.edition_id, post.slug),
    getPublishedEditorialPosts({
      locale: requestedLocale,
      page: 1,
      pageSize: 4,
    }),
  ]);
  const { data: recommendedBlogPosts } = recommendedBlogResult;
  const content = post.content_json;
  const isFrench = locale.toLowerCase().startsWith('fr');
  const summaryLocale = isFrench ? content?.summary30s?.fr : content?.summary30s?.en;
  const summaryItems = summaryLocale?.bullets?.length
    ? summaryLocale.bullets.slice(0, 3)
    : content
      ? [
        content.bigNews?.name && content.bigNews?.impact
          ? `${content.bigNews.name}: ${content.bigNews.impact}`
          : null,
        ...content.quickHits.map((item) => `${item.topic}: ${item.summary}`),
      ].filter((value): value is string => Boolean(value)).slice(0, 3)
      : [];
  const translationStatus = inferStatusFromContentMetadata(locale, null, post.locale);
  const displayTranslationStatus =
    translationStatus === 'not_translated' ? 'translated' : translationStatus;
  const articleMarkdown = stripTrailingGeneratedSourceCredit(post.content_markdown ?? '');
  const articleBlocks = articleMarkdown.trim().length > 0
    ? parseNewsArticleMarkdown(articleMarkdown, post.title)
    : [];
  const allTocItems = buildNewsArticleToc(articleBlocks);
  const tocItems = getRenderableNewsArticleToc(allTocItems);
  const baseUrl = getAppBaseUrl();
  const jsonLd = buildNewsArticleJsonLd({
    baseUrl,
    locale,
    post,
    homeLabel: t('breadcrumb_home'),
    newsLabel: t('breadcrumb_news'),
  });

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans overflow-x-hidden">
      <SeoAppJsonLd pathname={`/news/${post.slug}`} fallbackData={jsonLd} />
      <BaseHeader />
      <main className="flex-1 min-w-0 pt-28 sm:pt-32 pb-8 sm:pb-14 mx-auto max-w-7xl px-3.5 sm:px-6 w-full overflow-hidden">
        <div className="mb-5 sm:mb-8">
          <Link
            href="/news"
            className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/50 no-underline hover:text-kode01-pink flex items-center gap-1.5 sm:gap-2 transition-colors group"
          >
            <span className="transition-transform group-hover:-translate-x-1">&larr;</span> {t('back_to_news')}
          </Link>
        </div>

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_320px] min-w-0 items-start">
          <div className="min-w-0">
            <div className="mb-5 lg:hidden">
              <SponsoredPlacementSlot
                placement="news"
                locale={locale}
                pagePath={`/${locale}/news/${post.slug}`}
                layout="banner"
                showPlaceholderWhenEmpty
                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
              />
            </div>

            <article className="rounded-2xl sm:rounded-3xl border border-black/10 bg-white/85 p-4 sm:p-10 overflow-hidden">
              <header>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="rounded-full bg-kode01-noir px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    {post.locale}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' }) : t('draft')}
                  </span>
                </div>
                {post.tags && (post.tags as string[]).length > 0 && (
                  <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
                    {(post.tags as string[]).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg border border-black/5 bg-kode01-cream px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider text-kode01-noir/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <h1 className="mt-3 sm:mt-4 text-xl sm:text-4xl font-serif font-black leading-tight tracking-tight break-words">{post.title}</h1>
                <ApiContentStatusBadge
                  status={displayTranslationStatus}
                  locale={locale}
                  className="mt-3 sm:mt-4"
                />
                <p className="mt-4 sm:mt-5 text-sm sm:text-base text-kode01-noir/75 leading-relaxed">{post.intro}</p>
              </header>

              {summaryItems.length > 0 && (
                <section className="mt-5 sm:mt-10 rounded-xl sm:rounded-2xl border border-black/10 bg-kode01-cream/70 p-3.5 sm:p-6">
                  <h2 className="text-sm sm:text-lg font-serif font-black">{t('summary_title')}</h2>
                  <p className="mt-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-kode01-noir/45">{t('quick_hits_title')}</p>
                  <ul className="mt-2.5 sm:mt-3 list-disc pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-[13px] sm:text-sm leading-relaxed text-kode01-noir/85">
                    {summaryItems.map((item, index) => (
                      <li key={`summary-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              <NewsArticleTableOfContents items={tocItems} title={t('toc_title')} />

              {articleBlocks.length > 0 ? (
                renderNewsArticleBlocks(articleBlocks, allTocItems)
              ) : (
                <p className="mt-8 text-sm text-kode01-noir/65">{t('article_pending')}</p>
              )}

              <RecapArticleSources content={content} locale={locale} title={t('sources_title')} />
              <AiNewsNewsletterCta />
            </article>

            <div className="mt-6 sm:mt-8 lg:hidden">
              <SponsoredPlacementSlot
                placement="news"
                locale={locale}
                pagePath={`/${locale}/news/${post.slug}`}
                layout="banner"
                showPlaceholderWhenEmpty
                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
              />
            </div>

            {siblingPosts.length > 0 && (
              <aside className="mt-6 sm:mt-8 rounded-2xl sm:rounded-3xl border border-black/10 bg-white/70 p-4 sm:p-6 overflow-hidden">
                <h2 className="text-base sm:text-lg font-serif font-black">{t('other_language_edition')}</h2>
                <ul className="mt-3 sm:mt-4 list-none p-0 space-y-2">
                  {siblingPosts.map((item) => (
                    <li key={item.id}>
                      <Link href={`/news/${item.slug}`} locale={item.locale as 'en' | 'fr'} className="text-sm sm:text-base font-bold text-kode01-noir hover:text-kode01-pink break-words">
                        [{item.locale.toUpperCase()}] {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {recommendedBlogPosts.length > 0 && (
              <div className="mt-6 sm:mt-8">
                <CrossRecommendationsSection
                  locale={locale}
                  type="news-to-blog"
                  sourceSlug={post.slug}
                  items={recommendedBlogPosts}
                  limit={4}
                />
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <SponsoredPlacementSlot
                placement="news"
                locale={locale}
                pagePath={`/${locale}/news/${post.slug}`}
                layout="sidebar"
                showPlaceholderWhenEmpty
                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
              />
            </div>
          </aside>
        </div>
      </main>
      <BaseFooter />
    </div>
  );
}
