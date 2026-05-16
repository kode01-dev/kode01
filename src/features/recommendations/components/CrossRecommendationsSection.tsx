import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';
import type { EditorialPostListItem } from '@/features/editorial/types';
import type { RecapPostCard } from '@/features/ai-recap/types';
import { RecommendationTrackedLink } from './RecommendationTrackedLink';

interface CrossRecommendationsSectionProps {
  locale: string;
  type: 'blog-to-news' | 'news-to-blog';
  sourceSlug: string;
  items: Array<EditorialPostListItem | RecapPostCard>;
  limit?: number;
}

function isEditorialPost(item: EditorialPostListItem | RecapPostCard): item is EditorialPostListItem {
  return 'cover_image_url' in item;
}

export async function CrossRecommendationsSection({
  locale,
  type,
  sourceSlug,
  items,
  limit = 4,
}: CrossRecommendationsSectionProps) {
  if (items.length === 0) return null;

  const t = await getTranslations({
    locale,
    namespace: type === 'blog-to-news' ? 'editorial.blog' : 'artifacts_home.news',
  });

  const displayItems = items.slice(0, limit);
  const isBlogToNews = type === 'blog-to-news';

  return (
    <section className="mt-8 sm:mt-16 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-2 mb-5 sm:mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
          {isBlogToNews ? 'AI News' : 'Blog'}
        </p>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-serif font-black tracking-tight text-kode01-noir">
          {isBlogToNews ? t('recommended_news_title') : t('recommended_blog_title')}
        </h2>
        <p className="text-sm sm:text-base text-kode01-noir/60 font-medium">
          {isBlogToNews ? t('recommended_news_subtitle') : t('recommended_blog_subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {displayItems.map((item) => {
          const isBlogPost = isEditorialPost(item);
          const href = `/${isBlogToNews ? 'news' : 'blog'}/${item.slug}`;

          // For news posts, infer translation status
          const translationStatus = !isBlogPost && 'locale' in item
            ? inferStatusFromContentMetadata(locale, [item.locale], item.locale)
            : undefined;
          const displayTranslationStatus = translationStatus === 'not_translated' ? 'translated' : translationStatus;

          return (
            <RecommendationTrackedLink
              key={item.id}
              href={href}
              className={`group rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 ${isBlogToNews ? 'hover:shadow-[0_20px_50px_rgba(242,145,200,0.15)] hover:border-kode01-pink/30' : 'hover:shadow-[0_20px_50px_rgba(138,154,91,0.15)] hover:border-kode01-sauge/30'} hover:-translate-y-1 flex flex-col no-underline`}
              payload={{
                eventType: isBlogToNews ? 'blog_to_news_click' : 'news_to_blog_click',
                sourceType: isBlogToNews ? 'blog' : 'news',
                sourceSlug,
                signalPayload: {
                  targetSlug: item.slug,
                  targetLocale: item.locale,
                },
              }}
            >
              {/* Visual header - Image for blog posts, gradient for news posts */}
              {isBlogPost ? (
                // Blog card header (when showing blog posts on news pages)
                <div className="relative h-32 sm:h-44 bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60">
                  {item.cover_image_url ? (
                    <Image
                      src={item.cover_image_url}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                      />
                      <span className="relative text-sm font-bold tracking-widest text-white/90">kode01.blog</span>
                    </div>
                  )}
                </div>
              ) : (
                // News card header (when showing news posts on blog pages)
                <div className="relative h-32 sm:h-44 bg-gradient-to-br from-kode01-pink/80 to-kode01-pink/60">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="absolute inset-0 opacity-[0.04]"
                      style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                    />
                    <span className="relative text-sm font-bold tracking-widest text-white/90">kode01.news</span>
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-6 flex flex-col flex-1">
                {/* Metadata badges */}
                <div className="flex flex-wrap items-center gap-3">
                  {isBlogPost && 'category' in item && item.category && (
                    <span className="rounded-full border border-kode01-sauge/35 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                      {item.category}
                    </span>
                  )}
                  <span className="rounded-full bg-kode01-noir px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    {item.locale}
                  </span>
                  {!isBlogPost && displayTranslationStatus && (
                    <ApiContentStatusBadge status={displayTranslationStatus} locale={locale} />
                  )}
                  <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                    {item.published_at
                      ? new Date(item.published_at).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-US', { dateStyle: 'long' })
                      : 'Draft'}
                  </span>
                </div>

                {/* Tags for news posts */}
                {!isBlogPost && 'tags' in item && item.tags && item.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg border border-kode01-pink/20 bg-kode01-pink/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-kode01-pink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Title - Now properly prominent */}
                <h2
                  className={`mt-3 text-lg sm:text-xl font-serif font-black line-clamp-2 transition-colors ${isBlogToNews ? 'text-kode01-noir group-hover:text-kode01-pink' : 'text-kode01-noir group-hover:text-kode01-sauge'}`}
                >
                  {item.title}
                </h2>

                {/* Excerpt */}
                <p className="mt-3 text-sm text-kode01-noir/70 leading-relaxed line-clamp-3 flex-1">
                  {isBlogPost
                    ? item.excerpt || 'No excerpt available.'
                    : (item as RecapPostCard).excerpt || (item as RecapPostCard).intro || 'No excerpt available.'}
                </p>

                {/* CTA Link */}
                <div className="mt-4 pt-3 border-t border-black/5">
                  <span
                    className={`text-xs font-bold uppercase tracking-widest transition-colors ${isBlogToNews ? 'text-kode01-pink group-hover:text-kode01-noir' : 'text-kode01-sauge group-hover:text-kode01-noir'}`}
                  >
                    {t('read_article')} &rarr;
                  </span>
                </div>
              </div>
            </RecommendationTrackedLink>
          );
        })}
      </div>
    </section>
  );
}
