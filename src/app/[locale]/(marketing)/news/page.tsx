import { Suspense } from 'react';
import { Link } from '@/i18n/routing';
import { getPublishedRecapPostsPage } from '@/features/ai-recap/server/repository';
import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { Zap } from 'lucide-react';
import { SponsoredPlacementSlot } from '@/components/ads/SponsoredPlacementSlot';
import dynamic from 'next/dynamic';
const ProductsSection = dynamic(() => import('@/features/homepage/components/homepage-sections/sections/ProductsSection').then(mod => mod.ProductsSection));
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { NewsPageSkeleton } from '@/components/skeletons';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';
import { SortSelect } from '@/components/SortSelect';
import { ClapButton } from '@/features/claps/components/ClapButton';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import type { RecapPostCard } from '@/features/ai-recap/types';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'artifacts_home.news' });

  return applySeoMetadata({
    title: t('meta_title'),
    description: t('subtitle'),
    alternates: {
      canonical: `/${locale}/news`,
      types: {
        'application/rss+xml': [
          {
            title: locale === 'fr' ? 'KODE01 Nouvelles IA RSS' : 'KODE01 AI News RSS',
            url: `/${locale}/news/rss.xml`,
          },
        ],
      },
    },
  }, '/news', { locale });
}

type NewsPageData = {
  posts: RecapPostCard[];
  total: number;
  unavailable: boolean;
};

async function loadNewsPageData(args: {
  locale: string;
  loadedCount: number;
  sortMode: 'newest' | 'oldest';
  page: number;
}): Promise<NewsPageData> {
  try {
    const { data: posts, total } = await getPublishedRecapPostsPage({
      locale: args.locale,
      limit: args.loadedCount,
      offset: 0,
      sort: args.sortMode,
    });

    return { posts, total, unavailable: false };
  } catch (error) {
    console.error('News page data load failed:', {
      locale: args.locale,
      page: args.page,
      sort: args.sortMode,
      error,
    });
    return { posts: [], total: 0, unavailable: true };
  }
}

async function NewsPageContent({ locale, sort, page }: { locale: string; sort?: string; page: number }): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'artifacts_home.news' });
  const pageSize = 24;
  const loadedCount = Math.min(page * pageSize, 240);
  const sortMode = sort === 'oldest' ? 'oldest' : 'newest';
  const { posts, total, unavailable } = await loadNewsPageData({
    locale,
    loadedCount,
    sortMode,
    page,
  });

  const sortedPosts = posts;
  const featured = sortedPosts[0] ?? null;
  const rest = sortedPosts.slice(1);
  const hasMore = sortedPosts.length < total;
  const loadMoreParams = new URLSearchParams();
  if (sortMode === 'oldest') loadMoreParams.set('sort', 'oldest');
  loadMoreParams.set('page', String(page + 1));
  const loadMoreHref = `/news?${loadMoreParams.toString()}`;

  return (
    <>
      {/* Hero */}
      <header className="mb-8 sm:mb-16 relative">
        <div
          className="absolute -top-20 -right-20 w-40 sm:w-64 h-40 sm:h-64 rounded-full pointer-events-none opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(242,145,200,0.3), transparent 70%)' }}
        />
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-kode01-pink/60" />
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-kode01-noir/50">kode01.news</p>
        </div>
        <h1 className="text-2xl sm:text-5xl font-serif font-black tracking-tight relative z-10">{t('title')}</h1>
        <p className="mt-3 sm:mt-4 max-w-2xl text-sm sm:text-base text-kode01-noir/70 relative z-10">{t('subtitle')}</p>
        <div className="mt-4 sm:mt-6 h-1 w-12 sm:w-16 rounded-full bg-kode01-pink" />
      </header>

      {/* Ad slot */}
      <div className="mb-6 sm:mb-8">
        <SponsoredPlacementSlot
          placement="news"
          locale={locale}
          pagePath={`/${locale}/news`}
          layout="banner"
          showPlaceholderWhenEmpty
          fallbackAdSenseSlot="THIKI_NEWS_INDEX_SLOT"
        />
      </div>

      {unavailable ? (
        <div role="status" className="rounded-3xl border border-black/10 bg-white/70 p-10">
          <p className="text-sm font-bold uppercase tracking-widest text-kode01-noir/40">{t('unavailable_title')}</p>
          <p className="mt-2 text-kode01-noir/70">{t('unavailable_subtitle')}</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-3xl border border-black/10 bg-white/70 p-10">
          <p className="text-sm font-bold uppercase tracking-widest text-kode01-noir/40">{t('empty_title')}</p>
          <p className="mt-2 text-kode01-noir/70">{t('empty_subtitle')}</p>
        </div>
      ) : (
        <>
          {/* Sort control */}
          <div className="flex justify-end mb-6">
            <SortSelect labels={{ newest: t('sort_newest'), oldest: t('sort_oldest') }} />
          </div>

          {/* Featured post */}
          {featured && (() => {
            const translationStatus = inferStatusFromContentMetadata(locale, null, featured.locale);
            const displayTranslationStatus = translationStatus === 'not_translated' ? 'translated' : translationStatus;

            return (
              <article className="group mb-6 sm:mb-10 rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(242,145,200,0.15)] hover:border-kode01-pink/30 hover:-translate-y-1">
                  <div className="relative p-4 sm:p-8">
                    <div className="absolute top-4 right-3 sm:top-8 sm:right-6 z-10">
                      <ClapButton
                        contentType="recap_post"
                        contentId={featured.id}
                        initialTotalClaps={featured.clap_count ?? 0}
                        variant="compact"
                      />
                    </div>
                    <span className="inline-block rounded-full bg-kode01-pink/10 border border-kode01-pink/20 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-pink mb-2 sm:mb-3">
                      {t('featured')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-3 pr-10 sm:pr-0">
                      <span className="rounded-full bg-kode01-noir px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                        {featured.locale}
                      </span>
                      <ApiContentStatusBadge status={displayTranslationStatus} locale={locale} />
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                        {featured.published_at
                          ? new Date(featured.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                          : t('draft')}
                      </span>
                    </div>
                    {featured.tags && (featured.tags as string[]).length > 0 && (
                      <div className="mb-2 sm:mb-3 flex flex-wrap gap-1.5 sm:gap-2">
                        {(featured.tags as string[]).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg border border-kode01-pink/20 bg-kode01-pink/5 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider text-kode01-pink"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="text-xl sm:text-3xl font-serif font-black leading-tight">
                      <Link href={`/news/${featured.slug}`} className="no-underline text-kode01-noir hover:text-kode01-pink">
                        {featured.title}
                      </Link>
                    </h2>
                    <p className="mt-3 sm:mt-4 text-sm sm:text-base text-kode01-noir/70 leading-relaxed line-clamp-3 sm:line-clamp-4">
                      {featured.excerpt ?? featured.intro}
                    </p>
                    <div className="mt-4 sm:mt-6 flex items-center gap-4">
                      <Link
                        href={`/news/${featured.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-bold text-kode01-pink no-underline hover:text-kode01-noir transition-colors"
                      >
                        {t('read_article')} <span>&rarr;</span>
                      </Link>
                    </div>
                  </div>
              </article>
            );
          })()}

          {/* Post grid */}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {rest.map((post) => {
                const translationStatus = inferStatusFromContentMetadata(locale, null, post.locale);
                const displayTranslationStatus = translationStatus === 'not_translated' ? 'translated' : translationStatus;

                return (
                  <article
                    key={post.id}
                    className="group rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(242,145,200,0.15)] hover:border-kode01-pink/30 hover:-translate-y-1 flex flex-col"
                  >
                    <div className="relative p-3.5 sm:p-6 flex flex-col flex-1">
                      <div className="absolute top-3.5 right-3 sm:top-6 sm:right-5 z-10">
                        <ClapButton
                          contentType="recap_post"
                          contentId={post.id}
                          initialTotalClaps={post.clap_count ?? 0}
                          variant="compact"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 pr-10 sm:pr-0">
                        <span className="rounded-full bg-kode01-noir px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                          {post.locale}
                        </span>
                        <ApiContentStatusBadge status={displayTranslationStatus} locale={locale} />
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                          {post.published_at
                            ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                            : t('draft')}
                        </span>
                      </div>
                      {post.tags && (post.tags as string[]).length > 0 && (
                        <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                          {(post.tags as string[]).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-lg border border-kode01-pink/20 bg-kode01-pink/5 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider text-kode01-pink"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <h2 className="mt-2 sm:mt-3 text-base sm:text-xl font-serif font-black line-clamp-2">
                        <Link href={`/news/${post.slug}`} className="no-underline text-kode01-noir hover:text-kode01-pink">
                          {post.title}
                        </Link>
                      </h2>
                      <p className="mt-2 sm:mt-3 text-[13px] sm:text-sm text-kode01-noir/70 leading-relaxed line-clamp-3 flex-1">
                        {post.excerpt ?? post.intro}
                      </p>
                      <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-black/5">
                        <Link
                          href={`/news/${post.slug}`}
                          className="text-xs font-bold uppercase tracking-widest text-kode01-pink no-underline hover:text-kode01-noir transition-colors"
                        >
                          {t('read_article')} &rarr;
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Link
                href={loadMoreHref}
                className="inline-flex items-center justify-center rounded-full bg-kode01-noir px-8 py-3 text-xs font-bold uppercase tracking-widest text-white no-underline transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
              >
                {locale === 'fr' ? 'Charger plus' : 'Load more'}
              </Link>
            </div>
          )}
        </>
      )}

      {/* Marketplace Promo */}
      <div className="mt-16 sm:mt-24 border-t border-black/5 pt-16 sm:pt-24">
        <ProductsSection
          settings={{ limit: 4 }}
          content={null as never}
        />
      </div>
    </>
  );
}

export default async function NewsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { sort, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const t = await getTranslations({ locale, namespace: 'artifacts_home.news' });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('meta_title'),
    description: t('subtitle'),
    url: `https://kode01.com/${locale}/news`,
    inLanguage: locale,
  };

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans overflow-x-hidden">
      <SeoAppJsonLd pathname="/news" fallbackData={jsonLd} />
      <BaseHeader />
      <main className="flex-1 min-w-0 pt-40 pb-10 sm:pb-16 mx-auto max-w-6xl px-3.5 sm:px-6 w-full overflow-hidden">
        <Suspense fallback={<NewsPageSkeleton items={6} />}>
          <NewsPageContent locale={locale} sort={sort} page={page} />
        </Suspense>
      </main>
      <BaseFooter />
    </div>
  );
}
