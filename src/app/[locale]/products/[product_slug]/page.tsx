import { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Star, Download, ChevronRight, CheckCircle2, ShieldCheck, Clock, Layers, Zap, RefreshCw } from 'lucide-react';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { RouteScrollReset } from '@/components/layout/RouteScrollReset';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import Link from 'next/link';
import { PurchaseBlock } from './PurchaseBlock';
import { ViewTracker } from './ViewTracker';
import { ProductReviewsSection } from './ProductReviewsSection';
import { ExpandableDescription } from './ExpandableDescription';
import { BundleSection } from './BundleSection';
import { ProductGallery } from './ProductGallery';
import { StickyMobileCTA } from './StickyMobileCTA';
import { listPublicBundlesContainingProduct } from '@/features/bundles/server/public-bundles';
import { getProductDataCached } from '@/features/market/server/product-page-data';
import { BlueprintAccessPanel } from '@/features/agent-blueprints/components/BlueprintAccessPanel';
import { AiBlueprintBadge, BlueprintVerifiedBadge } from '@/features/agent-blueprints/components/BlueprintBadges';
import { ReportProductButton } from '@/features/moderation/components/ReportProductButton';
import { VendorBadges } from '@/features/vendor-badges/components/VendorBadges';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';


export async function generateMetadata({ params }: { params: Promise<{ product_slug: string, locale: string }> }): Promise<Metadata> {
    const { product_slug, locale } = await params;
    const product = await getProductDataCached(product_slug, locale);

    if (!product) return { title: 'Not Found' };

    return applySeoMetadata({
        title: product.title,
        description: product.description,
        openGraph: {
            title: product.title,
            description: product.description,
            type: 'website',
            images: [
                {
                    url: `/api/og?title=${encodeURIComponent(product.title)}&desc=${encodeURIComponent(product.category)}&price=$${product.price}`,
                    width: 1200,
                    height: 630,
                    alt: product.title,
                }
            ],
        }
    }, '/products/[product_slug]', { product_slug });
}

export default async function ProductPage({
    params,
}: {
    params: Promise<{ product_slug: string; locale: string }>;
}) {
    const { product_slug, locale } = await params;
    const t = await getTranslations('product');

    const product = await getProductDataCached(product_slug, locale);
    if (!product) {
        notFound();
    }

    const jsonLd: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        image: product.coverImage,
        description: product.description,
        offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'CAD',
            availability: 'https://schema.org/InStock',
        },
    };

    if (product.reviewsCount > 0 && product.rating !== null) {
        jsonLd.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewsCount,
        };
    }

    const bundlesContainingProduct = await listPublicBundlesContainingProduct(product.id);

    return (
        <div className="bg-kode01-white min-h-screen text-kode01-noir antialiased font-sans">
            <RouteScrollReset />
            <SeoAppJsonLd pathname={`/products/${product_slug}`} fallbackData={jsonLd} />
            <BaseHeader />
            <ViewTracker slug={product_slug} signalKeywords={[product.title, product.category, ...product.tags]} />
            <StickyMobileCTA
                productId={product.id}
                productTitle={product.title}
                finalPrice={product.price}
                coverImage={product.coverImage}
                isPWYW={product.isPWYW}
                hasVariants={(product.variants?.length ?? 0) > 0}
            />
            <main className="flex-1 pt-40 pb-32">
                <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12">
                    {/* Breadcrumbs – desktop: full path, mobile: Market > … > Title */}
                    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 sm:gap-2.5 text-xs sm:text-sm text-kode01-noir/40 mb-4 md:mb-10 font-bold uppercase tracking-widest overflow-hidden">
                        {PUBLIC_MARKETPLACE_ENABLED ? (
                            <Link href={`/${locale}/market`} className="shrink-0 hover:text-kode01-noir transition-colors">{t('breadcrumb.market')}</Link>
                        ) : (
                            <span className="shrink-0 text-kode01-noir/35">{t('breadcrumb.market')}</span>
                        )}
                        {/* Middle segments – hidden on mobile, replaced by ellipsis */}
                        {product.categorySlug && (
                            <>
                                <ChevronRight size={12} className="shrink-0 hidden sm:block" />
                                {PUBLIC_MARKETPLACE_ENABLED ? (
                                    <Link href={`/${locale}/market?category=${product.categorySlug}`} className="hidden sm:block shrink-0 hover:text-kode01-noir transition-colors">{product.categoryLabel}</Link>
                                ) : (
                                    <span className="hidden sm:block shrink-0 text-kode01-noir/35">{product.categoryLabel}</span>
                                )}
                            </>
                        )}
                        {product.subcategorySlug && product.subcategoryLabel && (
                            <>
                                <ChevronRight size={12} className="shrink-0 hidden sm:block" />
                                {PUBLIC_MARKETPLACE_ENABLED ? (
                                    <Link href={`/${locale}/market?category=${product.categorySlug}&subcategory=${product.subcategorySlug}`} className="hidden sm:block shrink-0 hover:text-kode01-noir transition-colors">{product.subcategoryLabel}</Link>
                                ) : (
                                    <span className="hidden sm:block shrink-0 text-kode01-noir/35">{product.subcategoryLabel}</span>
                                )}
                            </>
                        )}
                        {/* Mobile ellipsis for collapsed middle segments */}
                        {product.categorySlug && (
                            <>
                                <ChevronRight size={12} className="shrink-0 sm:hidden" />
                                <span className="sm:hidden">…</span>
                            </>
                        )}
                        <ChevronRight size={12} className="shrink-0" />
                        <span className="text-kode01-noir truncate">{product.title}</span>
                    </nav>

                    {/* Hero Grid: Image + Product Info */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-12">
                        {/* Left: Cover Image / Video Gallery */}
                        <div className="lg:col-span-7">
                            <ProductGallery
                                coverImage={product.coverImage}
                                videoUrl={product.videoUrl}
                                galleryUrls={product.galleryUrls}
                                title={product.title}
                                categoryBadge={
                                    <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 flex items-center gap-3">
                                        <div className="px-3 py-1.5 md:px-5 md:py-2 bg-white/20 backdrop-blur-xl rounded-full text-xs md:text-sm font-bold border border-white/20 text-white shadow-lg">
                                            {product.category}
                                        </div>
                                        {product.blueprintMeta && (
                                            <>
                                                <AiBlueprintBadge locale={locale} />
                                                {product.blueprintMeta.isVetted && <BlueprintVerifiedBadge locale={locale} />}
                                            </>
                                        )}
                                    </div>
                                }
                                priceBadge={
                                    <div className="absolute top-4 right-4 md:top-8 md:right-8 lg:hidden">
                                        <div className="px-4 py-2 bg-kode01-noir/80 backdrop-blur-xl rounded-full font-serif font-black text-white border border-white/20 shadow-lg text-sm">
                                            {product.isPWYW ? `${t('price_from')} $${product.minPrice}` : `$${product.price}`}
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        {/* Right: Product Info + Purchase */}
                        <div className="lg:col-span-5 space-y-4 lg:space-y-6">
                            {/* Inline Seller Badge */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-kode01-pink to-kode01-blue p-0.5 shadow-md overflow-hidden relative">
                                    {product.author.avatarUrl ? (
                                        <Image
                                            src={product.author.avatarUrl}
                                            alt={product.author.name}
                                            fill
                                            className="object-cover rounded-full bg-white"
                                            sizes="40px"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-white rounded-full flex items-center justify-center font-serif font-black text-lg text-kode01-noir lowercase">
                                            {product.author.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-serif font-black text-lg text-kode01-noir lowercase">{product.author.name}</span>
                                    </div>
                                    <p className="text-xs text-kode01-noir/40 font-bold uppercase tracking-widest">
                                        {t('author.joined')} {product.author.joined} · {product.sales} {t('meta.sales')}
                                    </p>
                                </div>
                            </div>

                            <VendorBadges vendorId={product.author.id} />

                            <ApiContentStatusBadge
                                status={product.translationStatus}
                                locale={locale}
                            />

                            {/* Product Title */}
                            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-serif font-black tracking-tight leading-[0.95] text-kode01-noir">
                                {product.title}
                            </h1>

                            {/* Compact Metrics Row */}
                            <div className="flex flex-wrap items-center gap-3 text-sm text-kode01-noir/60">
                                {product.rating !== null && (
                                    <div className="flex items-center gap-1.5">
                                        <Star size={16} className="fill-kode01-pink text-kode01-pink" />
                                        <span className="font-bold text-kode01-noir">{product.rating.toFixed(1)}</span>
                                        <span className="text-kode01-noir/40">
                                            ({product.reviewsCount > 0
                                                ? t('reviews.metric_count', { count: product.reviewsCount })
                                                : t('reviews.metric_empty')})
                                        </span>
                                    </div>
                                )}
                                {product.rating !== null && <span className="text-kode01-noir/20">·</span>}
                                <div className="flex items-center gap-1.5">
                                    <Download size={14} className="text-kode01-noir/40" />
                                    <span className="font-bold text-kode01-noir">{product.sales}</span>
                                    <span className="text-kode01-noir/40">{t('meta.sales')}</span>
                                </div>
                                <span className="text-kode01-noir/20">·</span>
                                <div className="flex items-center gap-1.5">
                                    <Layers size={14} className="text-kode01-noir/40" />
                                    <span className="font-bold text-kode01-noir">{product.format}</span>
                                </div>
                            </div>

                            {/* Purchase Card – inline on mobile, dark card on desktop */}
                            <div id="purchase-block-anchor" className="relative lg:bg-kode01-noir lg:text-white lg:rounded-[28px] lg:p-8 lg:shadow-xl lg:border lg:border-white/5 lg:overflow-hidden">
                                <div className="hidden lg:block absolute top-0 right-0 w-24 h-24 bg-kode01-pink rounded-full opacity-10 blur-3xl pointer-events-none" />
                                <div className="hidden lg:block absolute bottom-0 left-0 w-24 h-24 bg-kode01-blue rounded-full opacity-10 blur-3xl pointer-events-none" />

                                <PurchaseBlock product={product} />
                            </div>

                            {/* Trust Badges */}
                            <div className="flex flex-wrap gap-2">
                                <div className="flex items-center gap-2 px-3 py-2 bg-kode01-cream rounded-full border border-black/5">
                                    <Zap size={14} className="text-kode01-green" />
                                    <span className="text-xs font-bold text-kode01-noir/70">{t('trust_instant_access')}</span>
                                </div>
                                {product.tags.includes('commercial-use') && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-kode01-cream rounded-full border border-black/5">
                                        <ShieldCheck size={14} className="text-kode01-green" />
                                        <span className="text-xs font-bold text-kode01-noir/70">{t('trust_commercial_use')}</span>
                                    </div>
                                )}
                                {product.tags.includes('refund-available') && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-kode01-cream rounded-full border border-black/5">
                                        <RefreshCw size={14} className="text-kode01-green" />
                                        <span className="text-xs font-bold text-kode01-noir/70">{t('trust_money_back')}</span>
                                    </div>
                                )}
                            </div>

                            {/* Divider */}
                            <div className="border-t border-black/5" />

                            {/* Metadata Row */}
                            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-kode01-noir/40 uppercase tracking-widest">
                                <span className="flex items-center gap-1.5"><Clock size={12} /> {product.lastUpdated}</span>
                                <span className="text-kode01-noir/15">·</span>
                                <span className="flex items-center gap-1.5"><Layers size={12} /> {product.fileSize}</span>
                                <span className="text-kode01-noir/15">·</span>
                                <span>{product.format}</span>
                                <span className="text-kode01-noir/15 ml-auto">·</span>
                                <ReportProductButton
                                    productId={product.id}
                                    productTitle={product.title}
                                    className="ml-0"
                                />
                            </div>

                            {/* Description */}
                            <ExpandableDescription text={product.description} />
                        </div>
                    </div>

                    {/* Below the fold: Features, Bundle, Reviews */}
                    {product.features.length > 0 && (
                        <div className="mt-12 lg:mt-20 max-w-4xl">
                            <div className="space-y-6">
                                <h3 className="text-2xl font-serif font-black text-kode01-noir">{t('included')} :</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                    {product.features.map((feature: string, i: number) => (
                                        <div key={i} className="flex items-start gap-4 bg-kode01-white p-4 md:p-6 rounded-[20px] md:rounded-[32px] border border-black/5 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="w-10 h-10 bg-kode01-green/10 rounded-full flex items-center justify-center text-kode01-green flex-shrink-0">
                                                <CheckCircle2 size={22} />
                                            </div>
                                            <span className="text-kode01-noir font-bold text-lg leading-snug">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Blueprint Access Section (for AI Agent Blueprint products) */}
                    {product.blueprintMeta && (
                        <div className="mt-12 lg:mt-20 max-w-4xl">
                            <BlueprintAccessPanel
                                productId={product.id}
                                manifest={product.blueprintMeta.manifest}
                                readmeContent={product.blueprintMeta.readmeContent}
                                licenseType={product.blueprintMeta.licenseType}
                                isVetted={product.blueprintMeta.isVetted}
                                locale={locale}
                            />
                        </div>
                    )}

                    {/* Bundle Section (full width) */}
                    <BundleSection
                        locale={locale}
                        bundles={bundlesContainingProduct.map((bundle) => ({
                            id: bundle.id,
                            slug: bundle.slug,
                            title: bundle.title,
                            price: bundle.price,
                            totalOriginal: bundle.total_original,
                            discountPercent: bundle.discount_percent,
                            itemsCount: bundle.items_count,
                            coverImageUrl: bundle.cover_image_url,
                        }))}
                        backPath={`/${locale}/products/${product_slug}`}
                    />

                    {/* Reviews Section */}
                    <div className="mt-12 lg:mt-20 max-w-4xl space-y-6">
                        <h3 className="text-3xl font-serif font-black text-kode01-noir">
                            {t('tabs.reviews')}
                        </h3>
                        <ProductReviewsSection
                            reviews={product.reviews}
                        />
                    </div>
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

