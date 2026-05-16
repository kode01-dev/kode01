'use client';

import Image from 'next/image';
import { Package } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';

import { Link } from '@/i18n/routing';
import { AGENT_BLUEPRINTS_CATEGORY_SLUG } from '@/features/agent-blueprints/types';
import { AiBlueprintBadge, BlueprintVerifiedBadge } from '@/features/agent-blueprints/components/BlueprintBadges';

import { formatPrice, type MarketTranslationFn } from './market-utils';
import type { MarketProduct } from './market-types';

interface MarketProductCardProps {
  product: MarketProduct;
  locale: string;
  t: MarketTranslationFn;
}

function isNew(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return diffMs < 14 * 24 * 60 * 60 * 1000;
}

function isPopular(reviewsCount: number, averageRating: number | null): boolean {
  return reviewsCount >= 5 && averageRating !== null && averageRating >= 4.0;
}

export function MarketProductCard({ product, locale, t }: MarketProductCardProps): React.JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const productIsNew = isNew(product.createdAt);
  const productIsPopular = isPopular(product.reviewsCount, product.averageRating);

  const cardContent = (
    <>
      {/* 1. Image + overlay badges */}
      <div className="h-36 md:h-48 rounded-2xl border border-black/5 bg-kode01-cream/70 mb-4 md:mb-5 overflow-hidden relative">
        {product.coverImageUrl ? (
          <Image
            src={product.coverImageUrl}
            alt={product.title}
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 24vw, (min-width: 768px) 45vw, 100vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={48} className="text-kode01-noir/15" />
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.isBundle && (
            <span className="px-3 py-1 rounded-full bg-kode01-pink/90 text-kode01-noir text-[10px] font-black uppercase tracking-widest backdrop-blur-sm">
              {t('card.bundle')}
            </span>
          )}
          {productIsNew && !productIsPopular && (
            <span className="px-3 py-1 rounded-full bg-kode01-green text-white text-[10px] font-black uppercase tracking-widest">
              {t('card.new')}
            </span>
          )}
          {productIsPopular && (
            <span className="px-3 py-1 rounded-full bg-kode01-pink text-kode01-noir text-[10px] font-black uppercase tracking-widest">
              {t('card.popular')}
            </span>
          )}
        </div>
      </div>

      {/* 2. Category + Subcategory pills */}
      {(product.categoryLabel || product.subcategoryLabel) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {product.categoryLabel && (
            <span className="px-2.5 py-0.5 rounded-full bg-kode01-pink/15 text-kode01-noir text-[11px] font-bold">
              {product.categoryLabel}
            </span>
          )}
          {product.subcategoryLabel && (
            <span className="px-2.5 py-0.5 rounded-full bg-kode01-blue/20 text-kode01-noir text-[11px] font-bold">
              {product.subcategoryLabel}
            </span>
          )}
        </div>
      )}

      {/* 3. Title + Price */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-xl font-serif font-black leading-tight line-clamp-2">
          {product.title}
        </h3>
        <span className="px-3 py-1 rounded-full bg-kode01-noir text-white text-xs font-bold whitespace-nowrap">
          {formatPrice(product.price, locale)}
        </span>
      </div>

      {/* 4. Reviews — only shown when there are reviews */}
      {product.reviewsCount > 0 && product.averageRating !== null && (
        <p className="text-sm font-semibold mb-2 text-kode01-noir/70">
          {`\u2605 ${product.averageRating.toFixed(1)} (${product.reviewsCount})`}
        </p>
      )}

      {/* 5. Blueprint badges (agent blueprints category only) */}
      {product.categorySlug === AGENT_BLUEPRINTS_CATEGORY_SLUG && (
        <div className="flex flex-wrap gap-2 mb-2">
          <AiBlueprintBadge locale={locale} />
          {product.isBlueprintVetted && <BlueprintVerifiedBadge locale={locale} />}
        </div>
      )}

      {/* 6. Creator */}
      <p className="text-sm text-kode01-noir/55 mb-3">
        {t('card.by', { creator: product.creator })}
      </p>

      {/* 7. Description */}
      {product.description && (
        <p className="text-sm text-kode01-noir/60 line-clamp-2 mb-4">{product.description}</p>
      )}

      {/* 8. CTA */}
      <span className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-kode01-pink hover:underline underline-offset-2">
        {t('card.view_product')} &rarr;
      </span>
    </>
  );

  if (!product.slug) {
    return (
      <article className="rounded-2xl md:rounded-[28px] bg-white border border-black/10 p-4 md:p-5">
        {cardContent}
      </article>
    );
  }

  const currentPath = pathname ?? `/${locale}/market`;
  const currentSearch = searchParams?.toString() ?? '';
  const backPath = currentSearch ? `${currentPath}?${currentSearch}` : currentPath;
  const params = new URLSearchParams();
  params.set('back', backPath);
  const detailBasePath = product.isBundle ? `/bundles/${product.slug}` : `/products/${product.slug}`;
  const detailHref = `${detailBasePath}?${params.toString()}`;

  return (
    <Link
      href={detailHref}
      className="rounded-2xl md:rounded-[28px] bg-white border border-black/10 p-4 md:p-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
    >
      {cardContent}
    </Link>
  );
}
