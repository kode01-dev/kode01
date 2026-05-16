import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Package, Sparkles } from 'lucide-react';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { RouteScrollReset } from '@/components/layout/RouteScrollReset';
import Link from 'next/link';
import { BundleCheckoutButton } from '@/features/bundles/components/BundleCheckoutButton';
import { getPublicBundleBySlug } from '@/features/bundles/server/public-bundles';
import { resolveSafeBackPath } from '@/lib/routing/safe-back-path';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

type PageParams = { locale: string; slug: string };

function formatPrice(locale: string, value: number): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getPublicBundleBySlug(slug);
  if (!bundle) {
    return {
      title: 'Bundle not found',
    };
  }

  return applySeoMetadata({
    title: bundle.title,
    description: bundle.description ?? undefined,
    openGraph: {
      title: bundle.title,
      description: bundle.description ?? undefined,
      type: 'website',
      images: bundle.cover_image_url ? [{ url: bundle.cover_image_url, alt: bundle.title }] : undefined,
    },
  }, '/bundles/[slug]', { slug });
}

export default async function BundleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { locale, slug } = await params;
  const resolvedSearchParams = await searchParams;
  const bundle = await getPublicBundleBySlug(slug);
  if (!bundle) notFound();

  const defaultBackPath = `/${locale}/bundles`;
  const backPath = resolveSafeBackPath(resolvedSearchParams.back, locale) ?? defaultBackPath;
  const savings = Math.max(0, bundle.total_original - bundle.price);
  const itemCountLabel = locale === 'fr' ? 'articles inclus' : 'items included';
  const savingsLabel = locale === 'fr' ? 'Economie totale' : 'Total savings';
  const buyLabel = locale === 'fr' ? 'Acheter le bundle' : 'Buy bundle';
  const loadingLabel = locale === 'fr' ? 'Redirection...' : 'Redirecting...';

  return (
    <div className="min-h-screen bg-kode01-white text-kode01-noir antialiased">
      <SeoAppJsonLd pathname={`/bundles/${slug}`} />
      <RouteScrollReset />
      <BaseHeader />

      <main className="pt-32 pb-20">
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6 md:px-10">
          <Link
            href={backPath}
            className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/55 hover:text-kode01-noir"
          >
            <ArrowLeft size={14} />
            {locale === 'fr' ? 'Retour' : 'Back'}
          </Link>

          <div className="grid gap-8 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-[28px] border border-black/10 bg-kode01-cream">
                {bundle.cover_image_url ? (
                  <Image
                    src={bundle.cover_image_url}
                    alt={bundle.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 700px"
                  />
                ) : null}
              </div>
              <h1 className="text-4xl font-serif font-black leading-[0.95] text-kode01-noir">
                {bundle.title}
              </h1>
              {bundle.description ? (
                <p className="mt-4 whitespace-pre-wrap text-base text-kode01-noir/70">
                  {bundle.description}
                </p>
              ) : null}
            </section>

            <aside className="lg:col-span-5">
              <div className="rounded-[28px] border border-black/10 bg-kode01-noir p-6 text-white shadow-xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                  <Package size={12} />
                  Bundle
                </div>

                <div className="mb-2 flex items-end gap-3">
                  <span className="text-5xl font-serif font-black">{formatPrice(locale, bundle.price)}</span>
                  <span className="pb-2 text-lg font-bold text-white/40 line-through">
                    {formatPrice(locale, bundle.total_original)}
                  </span>
                </div>

                <div className="mb-6 inline-flex items-center rounded-full bg-kode01-pink/25 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
                  {savingsLabel}: {formatPrice(locale, savings)} ({bundle.discount_percent}%)
                </div>

                <BundleCheckoutButton
                  bundleId={bundle.id}
                  label={buyLabel}
                  loadingLabel={loadingLabel}
                  className="w-full rounded-2xl bg-kode01-pink px-5 py-4 text-xs font-black uppercase tracking-widest text-kode01-noir transition-colors hover:bg-white"
                />

                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-white/55">
                  {bundle.items_count} {itemCountLabel}
                </p>
              </div>
            </aside>
          </div>

          <section className="mt-12">
            <div className="mb-5 flex items-center gap-3">
              <Sparkles size={18} className="text-kode01-pink" />
              <h2 className="text-2xl font-serif font-black text-kode01-noir">
                {locale === 'fr' ? 'Ce qui est inclus' : "What's included"}
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {bundle.items.map((item) => {
                const detailHref = item.slug
                  ? `/${locale}/products/${item.slug}?back=${encodeURIComponent(`/${locale}/bundles/${bundle.slug}`)}`
                  : null;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-black/10 bg-kode01-cream/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-base font-bold text-kode01-noir">{item.title}</p>
                        <p className="mt-1 text-sm font-semibold text-kode01-noir/65">
                          {formatPrice(locale, item.price)}
                        </p>
                      </div>
                      <CheckCircle2 size={18} className="mt-1 flex-shrink-0 text-kode01-green" />
                    </div>

                    {detailHref ? (
                      <Link
                        href={detailHref}
                        className="mt-3 inline-block text-xs font-bold uppercase tracking-widest text-kode01-pink hover:text-kode01-noir"
                      >
                        {locale === 'fr' ? 'Voir le produit' : 'View product'}
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <BaseFooter />
    </div>
  );
}
