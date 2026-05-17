import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { BookOpen } from 'lucide-react';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import { SponsoredPlacementSlot } from '@/components/ads/SponsoredPlacementSlot';
import { SortSelect } from '@/components/SortSelect';
import { ClapCount } from '@/features/claps/components/ClapCount';
import { getSeoOverrides } from '@/lib/seo';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';
import { getAppBaseUrl } from '@/lib/env/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.blog' });
  const seo = await getSeoOverrides('/blog');
  const title = seo.title ?? t('title');
  const description = seo.metaDescription ?? t('description');
  const baseUrl = getAppBaseUrl();
  return {
    title,
    description,
    keywords: seo.metaKeywords,
    robots: seo.robots ?? 'index, follow',
    alternates: {
      canonical: seo.canonicalUrl ?? `${baseUrl}/${locale}/blog`,
      types: {
        'application/rss+xml': [
          {
            title: locale === 'fr' ? 'KODE01 Blogue RSS' : 'KODE01 Blog RSS',
            url: `${baseUrl}/${locale}/blog/rss.xml`,
          },
        ],
      },
    },
    openGraph: {
      title: seo.ogTitle ?? title,
      description: seo.ogDescription ?? description,
      images: seo.ogImage ? [{ url: seo.ogImage }] : undefined,
      type: (seo.ogType as 'website' | 'article' | 'book' | 'profile' | 'music.song' | 'music.album' | 'music.playlist' | 'music.radio_station' | 'video.movie' | 'video.episode' | 'video.tv_show' | 'video.other') ?? 'website',
    },
    twitter: {
      card: (seo.twitterCard as 'summary' | 'summary_large_image' | 'app' | 'player') ?? 'summary_large_image',
      title: seo.twitterTitle ?? seo.ogTitle ?? title,
      description: seo.twitterDescription ?? seo.ogDescription ?? description,
      images: seo.twitterImage ? [seo.twitterImage] : seo.ogImage ? [seo.ogImage] : undefined,
    },
  };
}

export default async function BlogIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { sort, page: pageParam } = await searchParams;
  const seo = await getSeoOverrides('/blog');
  const t = await getTranslations({ locale, namespace: 'editorial.blog' });
  const baseUrl = getAppBaseUrl();
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const pageSize = 24;
  const loadedCount = Math.min(page * pageSize, 240);
  const sortMode = sort === 'oldest' ? 'oldest' : 'newest';
  const { data: posts, total } = await getPublishedEditorialPosts({
    locale: locale as 'en' | 'fr',
    page: 1,
    pageSize: loadedCount,
    sort: sortMode,
  });

  const sortedPosts = posts;
  const featured = sortedPosts[0] ?? null;
  const rest = sortedPosts.slice(1);
  const hasMore = sortedPosts.length < total;
  const loadMoreParams = new URLSearchParams();
  if (sortMode === 'oldest') loadMoreParams.set('sort', 'oldest');
  loadMoreParams.set('page', String(page + 1));
  const loadMoreHref = `/blog?${loadMoreParams.toString()}`;
  const fallbackJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'KODE01 Blog',
    url: `${baseUrl}/${locale}/blog`,
    inLanguage: locale,
  };
  const schemaSource = seo.schemaJson && typeof seo.schemaJson === 'object' && !Array.isArray(seo.schemaJson)
    ? seo.schemaJson
    : {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _blocks: _, ...schemaJson } = schemaSource as Record<string, unknown>;
  const jsonLd = Object.keys(schemaJson).length > 0 ? schemaJson : fallbackJsonLd;

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForScriptTag(jsonLd) }}
      />
      <BaseHeader />
      <main className="flex-1 pt-28 sm:pt-32 pb-12 sm:pb-16 mx-auto max-w-6xl px-4 sm:px-6 w-full">
        {/* Hero */}
        <header className="mb-12 sm:mb-16 relative">
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(138,154,91,0.3), transparent 70%)' }}
          />
          <div className="flex items-center gap-2.5 mb-4">
            <BookOpen className="w-4 h-4 text-kode01-sauge/60" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-kode01-noir/50">kode01.blog</p>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif font-black tracking-tight relative z-10">{t('title')}</h1>
          <p className="mt-4 max-w-2xl text-base text-kode01-noir/70 relative z-10">{t('subtitle')}</p>
          <div className="mt-6 h-1 w-16 rounded-full bg-kode01-sauge" />
        </header>

        {/* Ad slot */}
        <div className="mb-8">
          <SponsoredPlacementSlot
            placement="news"
            locale={locale}
            pagePath={`/${locale}/blog`}
            layout="banner"
            showPlaceholderWhenEmpty
            fallbackAdSenseSlot="THIKI_BLOG_INDEX_SLOT"
          />
        </div>

        {posts.length === 0 ? (
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
            {featured && (
              <article className="group mb-10 rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(138,154,91,0.15)] hover:border-kode01-sauge/30 hover:-translate-y-1">
                <div className="flex flex-col md:flex-row">
                  <div className="relative md:w-2/5 h-56 md:h-auto bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60">
                    {featured.cover_image_url ? (
                      <Image
                        src={featured.cover_image_url}
                        alt={featured.title}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 40vw, 100vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                        <span className="relative text-lg font-bold tracking-widest text-white/90">kode01.blog</span>
                      </div>
                    )}
                  </div>
                  <div className="relative flex-1 p-5 sm:p-8">
                    <div className="absolute top-5 right-3 sm:top-8 sm:right-6">
                      <ClapCount totalClaps={featured.clap_count ?? 0} />
                    </div>
                    <span className="inline-block rounded-full bg-kode01-sauge/10 border border-kode01-sauge/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-sauge mb-3">
                      {t('featured')}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      {featured.is_sponsored && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                          {t('sponsored_badge')}
                        </span>
                      )}
                      <span className="rounded-full bg-kode01-noir px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                        {featured.locale}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                        {featured.published_at
                          ? new Date(featured.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                          : t('draft')}
                        {featured.author_name && (
                          <span className="ml-2 lowercase opacity-60">
                            • {t('by')} {featured.author_name}
                          </span>
                        )}
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-serif font-black leading-tight">
                      <Link href={`/blog/${featured.slug}`} className="no-underline text-kode01-noir hover:text-kode01-sauge">
                        {featured.title}
                      </Link>
                    </h2>
                    <p className="mt-4 text-sm sm:text-base text-kode01-noir/70 leading-relaxed line-clamp-4">
                      {featured.excerpt ?? t('no_excerpt')}
                    </p>
                    <div className="mt-6 flex items-center gap-4">
                      <Link
                        href={`/blog/${featured.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-bold text-kode01-sauge no-underline hover:text-kode01-noir transition-colors"
                      >
                        {t('read_article')} <span>&rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )}

            {/* Post grid */}
            {rest.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {rest.map((post) => (
                  <article
                    key={post.id}
                    className="group rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(138,154,91,0.15)] hover:border-kode01-sauge/30 hover:-translate-y-1 flex flex-col"
                  >
                    <div className="relative h-44 bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60">
                      {post.cover_image_url ? (
                        <Image
                          src={post.cover_image_url}
                          alt={post.title}
                          fill
                          className="object-cover"
                          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                          <span className="relative text-sm font-bold tracking-widest text-white/90">kode01.blog</span>
                        </div>
                      )}
                    </div>
                  <div className="relative p-4 sm:p-6 flex flex-col flex-1">
                  <div className="absolute top-4 right-3 sm:top-6 sm:right-5">
                    <ClapCount totalClaps={post.clap_count ?? 0} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {post.is_sponsored && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                        {t('sponsored_badge')}
                      </span>
                    )}
                    {post.category && (
                      <span className="rounded-full border border-kode01-sauge/35 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                        {post.category}
                      </span>
                    )}
                    <span className="rounded-full bg-kode01-noir px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                      {post.locale}
                    </span>
                        <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                          {post.published_at
                            ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                            : t('draft')}
                          {post.author_name && (
                            <span className="ml-2 lowercase opacity-60">
                              • {t('by')} {post.author_name}
                            </span>
                          )}
                        </span>
                      </div>
                      <h2 className="mt-3 text-lg sm:text-xl font-serif font-black line-clamp-2">
                        <Link href={`/blog/${post.slug}`} className="no-underline text-kode01-noir hover:text-kode01-sauge">
                          {post.title}
                        </Link>
                      </h2>
                      <p className="mt-3 text-sm text-kode01-noir/70 leading-relaxed line-clamp-3 flex-1">
                        {post.excerpt ?? t('no_excerpt')}
                      </p>
                      <div className="mt-4 pt-3 border-t border-black/5">
                        <Link
                          href={`/blog/${post.slug}`}
                          className="text-xs font-bold uppercase tracking-widest text-kode01-sauge no-underline hover:text-kode01-noir transition-colors"
                        >
                          {t('read_article')} &rarr;
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Link
                  href={loadMoreHref}
                  className="inline-flex items-center justify-center rounded-full bg-kode01-noir px-8 py-3 text-xs font-bold uppercase tracking-widest text-white no-underline transition-colors hover:bg-kode01-sauge hover:text-kode01-noir"
                >
                  {locale === 'fr' ? 'Charger plus' : 'Load more'}
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <BaseFooter />
    </div>
  );
}
