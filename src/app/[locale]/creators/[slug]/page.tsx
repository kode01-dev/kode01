import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { Star, ShoppingBag, Package } from 'lucide-react';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { RouteScrollReset } from '@/components/layout/RouteScrollReset';
import { FollowCreatorButton } from '@/features/creators/components/FollowCreatorButton';
import { getShopData } from '@/features/creators/server/shop-data';
import { VendorBadges } from '@/features/vendor-badges/components/VendorBadges';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';


export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const data = await getShopData(slug);
    if (!data) return { title: 'Not Found' };

    const t = await getTranslations({ locale, namespace: 'shop' });
    return applySeoMetadata({
        title: t('meta_title', { name: data.profile.displayName }),
        description: data.profile.description
            || t('meta_description', { name: data.profile.displayName }),
    }, '/creators/[slug]', { slug });
}

export default async function ShopPage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;
    const t = await getTranslations({ locale, namespace: 'shop' });
    const data = await getShopData(slug);

    if (!data) {
        notFound();
    }

    // Redirect UUID URLs to the clean slug URL
    if (data.profile.slug && data.profile.slug !== slug) {
        redirect(`/${locale}/creators/${data.profile.slug}`);
    }

    const { profile, products, stats } = data;
    const avatarUrl = profile.avatarUrl || '/placeholder-avatar.png';
    const memberSince = profile.createdAt
        ? new Date(profile.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-US', {
            month: 'long',
            year: 'numeric',
        })
        : '';

    return (
        <div className="bg-kode01-cream min-h-screen text-kode01-noir antialiased font-sans flex flex-col">
            <SeoAppJsonLd pathname={`/creators/${slug}`} />
            <RouteScrollReset />
            <BaseHeader />

            <main className="flex-1 pt-32">
                {/* Hero Banner */}
                <section className="relative bg-kode01-noir overflow-hidden">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-72 h-72 bg-kode01-pink rounded-full opacity-15 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-10 w-56 h-56 bg-kode01-blue rounded-full opacity-10 blur-3xl pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-kode01-green rounded-full opacity-10 blur-3xl pointer-events-none" />

                    <div className="relative max-w-[1440px] mx-auto px-6 md:px-12 pt-16 pb-24 md:pt-20 md:pb-28 flex flex-col items-center text-center">
                        {/* Avatar */}
                        <div className="relative w-32 h-32 md:w-40 md:h-40 mb-8">
                            <div className="w-full h-full rounded-full overflow-hidden bg-kode01-cream border-4 border-white/20 shadow-2xl ring-4 ring-kode01-pink/20">
                                <Image
                                    src={avatarUrl}
                                    alt={profile.displayName}
                                    width={160}
                                    height={160}
                                    className="object-cover w-full h-full"
                                />
                            </div>

                        </div>

                        {/* Name */}
                        <h1 className="text-4xl md:text-6xl font-serif font-black tracking-tight text-kode01-white mb-4">
                            {profile.displayName}
                        </h1>

                        {/* Description */}
                        {profile.description && (
                            <p className="text-lg text-kode01-white/60 max-w-xl mb-4 leading-relaxed">
                                {profile.description}
                            </p>
                        )}

                        {/* Member since */}
                        {memberSince && (
                            <p className="text-sm font-bold uppercase tracking-widest text-kode01-white/30 mb-6">
                                {t('member_since', { date: memberSince })}
                            </p>
                        )}

                        {/* Public vendor badges */}
                        <div className="mb-8 flex justify-center">
                            <VendorBadges vendorId={profile.id} variant="dark" />
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-6 md:gap-10 text-sm font-bold uppercase tracking-widest text-kode01-white/50 mb-10">
                            <div className="flex items-center gap-2">
                                <Package size={16} className="text-kode01-pink" />
                                <span>{t('products_count', { count: stats.productsCount })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ShoppingBag size={16} className="text-kode01-blue" />
                                <span>{t('sales_count', { count: stats.totalSales })}</span>
                            </div>
                            {stats.averageRating !== null && (
                                <div className="flex items-center gap-2">
                                    <Star size={16} className="text-kode01-pink fill-kode01-pink" />
                                    <span>{stats.averageRating.toFixed(1)} ({stats.totalReviews})</span>
                                </div>
                            )}
                        </div>

                        {/* Follow Button */}
                        <FollowCreatorButton creatorId={profile.id} variant="full" />
                    </div>
                </section>

                {/* Products Section */}
                <div className="max-w-[1440px] mx-auto px-6 md:px-12">
                    <section className="py-16 md:py-24">
                        {products.length > 0 && (
                            <div className="mb-10">
                                <h2 className="text-kode01-noir/40 font-bold text-sm uppercase tracking-widest">
                                    {t('products_count', { count: products.length })}
                                </h2>
                            </div>
                        )}

                        {products.length === 0 ? (
                            <div className="py-24 bg-white/50 rounded-[40px] border-2 border-dashed border-kode01-noir/10 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-kode01-cream rounded-full flex items-center justify-center mb-6 shadow-sm">
                                    <ShoppingBag size={28} className="text-kode01-noir/20" />
                                </div>
                                <h3 className="text-xl font-bold text-kode01-noir mb-2">
                                    {t('no_products')}
                                </h3>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {products.map((product) => {
                                    const price = Number(product.price) || 0;
                                    const displayPrice = price > 0
                                        ? `$${price.toFixed(2)}`
                                        : 'Free';

                                    return (
                                        <Link
                                            key={product.id}
                                            href={`/${locale}/products/${product.slug}`}
                                            className="group block"
                                        >
                                            <article className="rounded-[28px] bg-white border border-black/5 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                                <div
                                                    className="h-48 rounded-2xl border border-black/5 bg-kode01-cream/70 mb-5"
                                                    style={
                                                        product.cover_image_url
                                                            ? {
                                                                backgroundImage: `url(${product.cover_image_url})`,
                                                                backgroundSize: 'cover',
                                                                backgroundPosition: 'center',
                                                            }
                                                            : undefined
                                                    }
                                                />
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <h3 className="text-xl font-serif font-black leading-tight line-clamp-2">
                                                        {product.title}
                                                    </h3>
                                                    <span className="px-3 py-1 rounded-full bg-kode01-noir text-white text-xs font-bold whitespace-nowrap">
                                                        {displayPrice}
                                                    </span>
                                                </div>
                                                <span className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-kode01-noir/50 group-hover:text-kode01-pink transition-colors">
                                                    {t('view_product')}
                                                </span>
                                            </article>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            <BaseFooter />
        </div>
    );
}

