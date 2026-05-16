import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';
import { extractKeywordTokens } from '../lib/keywords';
import { RecommendationTrackedLink } from './RecommendationTrackedLink';
import { RecommendedPaidProduct } from '../types';

interface RecommendedPaidProductsSectionProps {
  locale: string;
  sourceType: 'product';
  sourceSlug?: string;
  products: RecommendedPaidProduct[];
  backPath?: string;
}

function formatPrice(value: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}

export async function RecommendedPaidProductsSection({
  locale,
  sourceType,
  sourceSlug,
  products,
  backPath,
}: RecommendedPaidProductsSectionProps) {
  if (products.length === 0) return null;

  const t = await getTranslations({ locale, namespace: 'recommendations' });

  return (
    <section className="mt-16">
      <div className="flex flex-col gap-2 mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">{t('eyebrow')}</p>
        <h2 className="text-3xl md:text-4xl font-serif font-black tracking-tight text-kode01-noir">
          {t('title')}
        </h2>
        <p className="text-kode01-noir/60 font-medium">
          {t('subtitle_product')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {products.map((product) => {
          const translationStatus = inferStatusFromContentMetadata(
            locale,
            product.contentLocales,
            product.contentSourceLocale,
          );
          const keywords = extractKeywordTokens([
            product.title,
            product.description,
            product.category,
            product.tags.join(' '),
            product.sellerName,
          ]);

          const linkParams = new URLSearchParams();
          if (backPath) {
            linkParams.set('back', backPath);
          }
          const href = linkParams.size > 0
            ? `/${locale}/products/${product.slug}?${linkParams.toString()}`
            : `/${locale}/products/${product.slug}`;

          return (
            <RecommendationTrackedLink
              key={product.id}
              href={href}
              className="group rounded-[28px] bg-white border border-black/10 p-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-200 no-underline"
              payload={{
                eventType: 'recommendation_click',
                sourceType,
                sourceSlug,
                targetProductId: product.id,
                signalPayload: {
                  keywords,
                },
              }}
            >
              <div className="h-40 rounded-2xl border border-black/5 bg-kode01-cream/70 mb-4 overflow-hidden relative">
                {product.coverImageUrl ? (
                  <Image
                    src={product.coverImageUrl}
                    alt={product.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : null}
              </div>

              <h3 className="text-xl font-serif font-black leading-tight text-kode01-noir line-clamp-2 mb-2">
                {product.title}
              </h3>
              <ApiContentStatusBadge
                status={translationStatus}
                locale={locale}
                className="mb-3"
              />
              <p className="text-sm text-kode01-noir/60 line-clamp-2 mb-4">
                {product.description}
              </p>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-kode01-noir/70">
                  {product.sellerName}
                </span>
                <span className="px-3 py-1 rounded-full bg-kode01-noir text-white text-xs font-bold">
                  {product.isPWYW && product.minPrice > 0
                    ? t('price_from', { price: formatPrice(product.minPrice, locale) })
                    : formatPrice(product.price, locale)}
                </span>
              </div>
            </RecommendationTrackedLink>
          );
        })}
      </div>
    </section>
  );
}
