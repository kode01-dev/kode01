'use client';

import Image from 'next/image';
import Link from 'next/link';

interface ProductBundlePreview {
  id: string;
  slug: string;
  title: string;
  price: number;
  totalOriginal: number;
  discountPercent: number;
  itemsCount: number;
  coverImageUrl: string | null;
}

interface BundleSectionProps {
  locale: string;
  bundles: ProductBundlePreview[];
  backPath?: string;
}

function formatPrice(locale: string, value: number): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(value);
}

export function BundleSection({
  locale,
  bundles,
  backPath,
}: BundleSectionProps) {
  if (bundles.length === 0) return null;

  const heading = locale === 'fr' ? 'Inclus dans ces bundles' : 'Included in these bundles';
  const ctaLabel = locale === 'fr' ? 'Voir le bundle' : 'View bundle';
  const itemsLabel = locale === 'fr' ? 'articles' : 'items';
  const saveLabel = locale === 'fr' ? 'Economie' : 'Save';

  function buildHref(slug: string): string {
    const params = new URLSearchParams();
    if (backPath) params.set('back', backPath);
    return params.size > 0
      ? `/${locale}/bundles/${slug}?${params.toString()}`
      : `/${locale}/bundles/${slug}`;
  }

  return (
    <section className="mt-12 lg:mt-20">
      <div className="rounded-[24px] md:rounded-[32px] border border-black/10 bg-kode01-cream/40 p-6 md:p-8">
        <h3 className="mb-6 text-2xl font-serif font-black text-kode01-noir">
          {heading}
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {bundles.map((bundle) => {
            const savings = Math.max(0, bundle.totalOriginal - bundle.price);
            return (
              <article
                key={bundle.id}
                className="overflow-hidden rounded-[20px] border border-black/10 bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex gap-4">
                  <div className="relative h-20 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-kode01-cream">
                    {bundle.coverImageUrl ? (
                      <Image
                        src={bundle.coverImageUrl}
                        alt={bundle.title}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-base font-black text-kode01-noir">
                      {bundle.title}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                      {bundle.itemsCount} {itemsLabel}
                    </p>
                    <p className="mt-2 text-sm font-bold text-kode01-noir/65">
                      <span className="mr-2 line-through">
                        {formatPrice(locale, bundle.totalOriginal)}
                      </span>
                      <span className="text-kode01-noir">{formatPrice(locale, bundle.price)}</span>
                    </p>
                  </div>
                </div>

                <div className="mb-4 inline-flex items-center rounded-full bg-kode01-pink/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-kode01-noir">
                  {saveLabel}: {formatPrice(locale, savings)} ({bundle.discountPercent}%)
                </div>

                <Link
                  href={buildHref(bundle.slug)}
                  className="block w-full rounded-xl bg-kode01-noir px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
                >
                  {ctaLabel}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
