'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import type { RecommendationContext, RecommendedPaidProduct } from '../types';
import { extractKeywordTokens } from '../lib/keywords';
import { RecommendationTrackedLink } from './RecommendationTrackedLink';

type RecommendationLabels = {
  eyebrow: string;
  title: string;
  subtitleProduct: string;
  priceFrom: string;
};

interface RecommendedPaidProductsHydratedSectionProps {
  locale: string;
  sourceType: 'product';
  sourceSlug?: string;
  backPath?: string;
  context: RecommendationContext;
  limit?: number;
  initialProducts: RecommendedPaidProduct[];
  labels: RecommendationLabels;
}

function formatPrice(value: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}

export function RecommendedPaidProductsHydratedSection({
  locale,
  sourceType,
  sourceSlug,
  backPath,
  context,
  limit = 4,
  initialProducts,
  labels,
}: RecommendedPaidProductsHydratedSectionProps) {
  const [products, setProducts] = useState<RecommendedPaidProduct[]>(initialProducts);
  const contextKey = useMemo(() => JSON.stringify(context), [context]);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch('/api/recommendations/personalized', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context,
            limit,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as { items?: RecommendedPaidProduct[] };
        if (Array.isArray(payload.items) && payload.items.length > 0) {
          setProducts(payload.items);
        }
      } catch {
        // Personalization must not block UI.
      }
    };

    void run();
    return () => controller.abort();
  }, [context, contextKey, limit]);

  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex flex-col gap-2 mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">{labels.eyebrow}</p>
        <h2 className="text-3xl md:text-4xl font-serif font-black tracking-tight text-kode01-noir">
          {labels.title}
        </h2>
        <p className="text-kode01-noir/60 font-medium">
          {labels.subtitleProduct}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {products.map((product) => {
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
                status={product.translationStatus ?? 'unverified'}
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
                    ? `${labels.priceFrom} ${formatPrice(product.minPrice, locale)}`
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
