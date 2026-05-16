import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { SponsoredPlacementSlot } from '@/components/ads/SponsoredPlacementSlot';
import { getAppBaseUrl } from '@/lib/env/server';
import {
  getEditorialTranslations,
  getPublishedEditorialPostBySlug,
} from '@/features/editorial/server/repository';
import { EditorialMarkdown } from '@/features/editorial/lib/markdown';
import { getPublishedRecapPosts } from '@/features/ai-recap/server/repository';
import { CrossRecommendationsSection } from '@/features/recommendations/components/CrossRecommendationsSection';
import { EditorialViewTracker } from '@/features/editorial/components/EditorialViewTracker';
import { ClapButton } from '@/features/claps/components/ClapButton';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';
import { getSeoOverrides } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const pathname = `/blog/${slug}`;
  const [post, seo] = await Promise.all([
    getPublishedEditorialPostBySlug({ locale: locale as 'en' | 'fr', slug }),
    getSeoOverrides(pathname),
  ]);

  if (!post) {
    return { title: 'Not Found' };
  }

  const baseUrl = getAppBaseUrl();
  const title = seo.title ?? post.seo_title ?? post.title;
  const description = seo.metaDescription ?? post.seo_description ?? post.excerpt ?? post.title;

  return {
    title,
    description,
    keywords: seo.metaKeywords,
    robots: seo.robots ?? 'index, follow',
    alternates: {
      canonical: seo.canonicalUrl ?? `${baseUrl}/${locale}/blog/${post.slug}`,
    },
    openGraph: {
      title: seo.ogTitle ?? title,
      description: seo.ogDescription ?? description,
      type: (seo.ogType as 'website' | 'article' | 'book' | 'profile' | 'music.song' | 'music.album' | 'music.playlist' | 'music.radio_station' | 'video.movie' | 'video.episode' | 'video.tv_show' | 'video.other') ?? 'article',
      images: seo.ogImage ? [{ url: seo.ogImage }] : post.cover_image_url ? [{ url: post.cover_image_url }] : undefined,
    },
    twitter: {
      card: (seo.twitterCard as 'summary' | 'summary_large_image' | 'app' | 'player') ?? 'summary_large_image',
      title: seo.twitterTitle ?? seo.ogTitle ?? title,
      description: seo.twitterDescription ?? seo.ogDescription ?? description,
      images: seo.twitterImage ? [seo.twitterImage] : seo.ogImage ? [seo.ogImage] : post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'editorial.blog' });
  const pathname = `/blog/${slug}`;
  const [post, seo] = await Promise.all([
    getPublishedEditorialPostBySlug({ locale: locale as 'en' | 'fr', slug }),
    getSeoOverrides(pathname),
  ]);

  if (!post) {
    notFound();
  }

  const baseUrl = getAppBaseUrl();
  const [translations, recommendedNews] = await Promise.all([
    getEditorialTranslations(post.translation_group_id),
    getPublishedRecapPosts(4, locale),
  ]);
  const otherLocales = translations.filter((item) => item.id !== post.id);
  const fallbackJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seo_title ?? post.title,
    description: post.seo_description ?? post.excerpt ?? post.title,
    image: post.cover_image_url ? [post.cover_image_url] : undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    inLanguage: post.locale,
    mainEntityOfPage: `${baseUrl}/${locale}/blog/${post.slug}`,
  };
  const schemaSource = seo.schemaJson && typeof seo.schemaJson === 'object' && !Array.isArray(seo.schemaJson)
    ? seo.schemaJson
    : {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _blocks: _, ...schemaJson } = schemaSource as Record<string, unknown>;
  const jsonLd = Object.keys(schemaJson).length > 0 ? schemaJson : fallbackJsonLd;

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForScriptTag(jsonLd) }}
      />
      <BaseHeader />
      <EditorialViewTracker postId={post.id} />
      <main className="flex-1 pt-28 sm:pt-32 pb-10 sm:pb-14 mx-auto max-w-7xl px-4 sm:px-6 w-full">
        <div className="mb-8">
          <Link
            href="/blog"
            className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50 no-underline hover:text-kode01-pink flex items-center gap-2 transition-colors group"
          >
            <span className="transition-transform group-hover:-translate-x-1">&larr;</span> {t('back_to_blog')}
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-5 lg:hidden">
              <SponsoredPlacementSlot
                placement="news"
                locale={locale}
                pagePath={`/${locale}/blog/${slug}`}
                layout="banner"
                showPlaceholderWhenEmpty
                fallbackAdSenseSlot="THIKI_BLOG_DETAIL_SLOT"
              />
            </div>

            <article className="relative rounded-2xl sm:rounded-3xl border border-black/10 bg-white/85 p-5 sm:p-10">
              <div className="absolute top-5 right-3 sm:top-8 sm:right-6 z-10">
                <ClapButton
                  contentType="editorial_post"
                  contentId={post.id}
                  initialTotalClaps={post.clap_count ?? 0}
                  variant="full"
                />
              </div>
              <header>
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
                    {post.published_at ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' }) : t('draft')}
                    {post.author_name && (
                      <span className="ml-2 lowercase opacity-60">
                        • {t('by')} {post.author_name}
                      </span>
                    )}
                  </span>
                </div>
                <h1 className="mt-4 text-2xl sm:text-4xl font-serif font-black leading-tight tracking-tight">{post.title}</h1>
                {post.excerpt && <p className="mt-5 text-base text-kode01-noir/75 leading-relaxed">{post.excerpt}</p>}
                <div className="relative mt-6 overflow-hidden rounded-2xl border border-black/10">
                  {post.cover_image_url ? (
                    <Image
                      src={post.cover_image_url}
                      alt={post.title}
                      width={1200}
                      height={630}
                      className="h-auto w-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60" style={{ aspectRatio: '1200/630' }}>
                      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                      <span className="relative text-xl font-bold tracking-widest text-white/90">kode01.blog</span>
                    </div>
                  )}
                </div>
              </header>

              <EditorialMarkdown markdown={post.content_markdown} className="mt-8" />

              {/* Bottom border — clap button is positioned top-right */}
              <div className="mt-8 border-t border-black/5 pt-1" />
            </article>

            {otherLocales.length > 0 && (
              <aside className="mt-8 rounded-3xl border border-black/10 bg-white/70 p-6">
                <h2 className="text-lg font-serif font-black">{t('other_languages')}</h2>
                <ul className="mt-4 list-none p-0 space-y-2">
                  {otherLocales.map((item) => (
                    <li key={item.id}>
                      <Link href={`/blog/${item.slug}`} locale={item.locale} className="font-bold text-kode01-noir hover:text-kode01-pink">
                        [{item.locale.toUpperCase()}] {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {recommendedNews.length > 0 && (
              <div className="mt-8">
                <CrossRecommendationsSection
                  locale={locale}
                  type="blog-to-news"
                  sourceSlug={slug}
                  items={recommendedNews}
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
                pagePath={`/${locale}/blog/${slug}`}
                layout="sidebar"
                showPlaceholderWhenEmpty
                fallbackAdSenseSlot="THIKI_BLOG_DETAIL_SLOT"
              />
            </div>
          </aside>
        </div>
      </main>
      <BaseFooter />
    </div>
  );
}
