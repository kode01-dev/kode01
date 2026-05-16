'use client';

import Image from 'next/image';
import React, { useEffect, useState, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { MarketingGridSkeleton } from '@/components/skeletons';
import type { HomepageSectionContent } from '@/features/homepage-layout/types';
import { isDbUnavailableApiPayload } from '@/lib/resilience/db-unavailable';
import {
    inferStatusFromContentMetadata,
    inferStatusFromLocalizedPair,
    mergeApiContentTranslationStatuses,
} from '@/lib/i18n/api-content-status';
import type { ApiContentTranslationStatus } from '@/lib/i18n/api-content-status';
import {
    getErrorMessage,
    getLocalizedSectionValue,
    parseNonNegativeInteger,
} from '../helpers';

export interface Product {
    id: string;
    slug: string;
    title: string;
    creator: string;
    price: string;
    averageRating: number | null;
    reviewsCount: number;
    tags: string[];
    translationStatus: ApiContentTranslationStatus;
    thumbBg: string;
    thumbContent: React.ReactNode;
    createdAt: string;
    isBundle: boolean;
    coverImageUrl: string | null;
}

export interface HomeProductsApiItem {
    id: string;
    slug: string;
    title: string;
    price: number;
    content_locales: Array<'fr' | 'en'> | null;
    content_source_locale: 'fr' | 'en' | null;
    cover_image_url: string | null;
    category: string | null;
    category_ref: { slug: string; name_en: string | null; name_fr: string | null } | null;
    tags: string[];
    seller: { display_name: string | null; shop_name: string | null } | null;
    average_rating: number | null;
    reviews_count: number;
    createdAt?: string;
    isBundle?: boolean;
}

const ProductCard = ({ product }: { product: Product }) => {
    const t = useTranslations('artifacts_home.products');
    const tMarket = useTranslations('market');
    const locale = useLocale();
    const [hovered, setHovered] = useState(false);

    const createdMs = product.createdAt ? new Date(product.createdAt).getTime() : 0;
    const isNew = createdMs > 0 && (new Date().getTime() - createdMs < 14 * 24 * 60 * 60 * 1000);
    const isPopular = product.reviewsCount >= 5 && product.averageRating !== null && product.averageRating >= 4.0;

    return (
        <Link
            href={`/products/${product.slug}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                padding: '24px',
                transition: 'transform 0.2s',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
            }}
        >
            <div
                style={{
                    height: '220px',
                    background: product.thumbBg,
                    borderRadius: '16px',
                    marginBottom: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {product.coverImageUrl ? (
                    <Image
                        src={product.coverImageUrl}
                        alt={product.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 hover:scale-105"
                        priority={false}
                    />
                ) : (
                    product.thumbContent
                )}
                <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 1 }}>
                    {product.isBundle && (
                        <span style={{ padding: '4px 12px', borderRadius: '999px', background: 'rgba(255,105,180,0.9)', color: '#1A1A1A', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', backdropFilter: 'blur(4px)' }}>
                            {tMarket('card.bundle')}
                        </span>
                    )}
                    {isNew && !isPopular && (
                        <span style={{ padding: '4px 12px', borderRadius: '999px', background: '#2B463C', color: 'white', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {tMarket('card.new')}
                        </span>
                    )}
                    {isPopular && (
                        <span style={{ padding: '4px 12px', borderRadius: '999px', background: '#FF69B4', color: '#1A1A1A', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {tMarket('card.popular')}
                        </span>
                    )}
                </div>
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px',
                }}
            >
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '4px', lineHeight: 1.3 }}>
                        {product.title}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#555555' }}>{t('by', { creator: product.creator })}</div>
                </div>
                <div
                    style={{
                        background: '#1A1A1A',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {product.price}
                </div>
            </div>
            <ApiContentStatusBadge status={product.translationStatus} locale={locale} className="mb-3" />
            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {product.reviewsCount > 0 && product.averageRating !== null ? (
                    <span>
                        <span style={{ color: '#FFC107' }}>{'?'}</span> {product.averageRating.toFixed(1)} ({product.reviewsCount})
                    </span>
                ) : (
                    <span style={{ color: '#555555' }}>{t('no_reviews')}</span>
                )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 'auto', paddingTop: '16px' }}>
                {product.tags.map((tag: string, index) => (
                    <span
                        key={`${product.id}-${tag}-${index}`}
                        style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '4px 12px',
                            borderRadius: '8px',
                            background: '#F4F1EA',
                            color: '#555555',
                        }}
                    >
                        {tag}
                    </span>
                ))}
            </div>
        </Link>
    );
};

interface ProductsSectionProps {
    template?: string;
    content?: HomepageSectionContent;
    settings?: Record<string, unknown>;
    initialProducts?: HomeProductsApiItem[];
}

export const ProductsSection = ({
    content,
    settings,
    initialProducts,
}: ProductsSectionProps) => {
    const t = useTranslations('artifacts_home.products');
    const tMarket = useTranslations('market');
    const locale = useLocale();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(!initialProducts || initialProducts.length === 0);
    const limit = Number.isInteger(settings?.limit) ? Math.min(Math.max(Number(settings?.limit), 1), 12) : 4;
    const title = getLocalizedSectionValue(content, 'title', locale) ?? t('title');
    const ctaLabel = getLocalizedSectionValue(content, 'cta_label', locale) ?? t('view_all');
    const ctaHref = content?.cta_href || '/market';
    const resolvedCtaHref = ctaHref.startsWith('http')
        ? ctaHref
        : `/${locale}${ctaHref.startsWith('/') ? ctaHref : `/${ctaHref}`}`;

    const mapProducts = useMemo(() => (rows: HomeProductsApiItem[]) => {
        return rows.map((p) => {
            const categoryRef = p.category_ref;
            const localizedCategoryFallback = locale === 'fr'
                ? (categoryRef?.name_fr || categoryRef?.name_en || p.category || 'Digital')
                : (categoryRef?.name_en || categoryRef?.name_fr || p.category || 'Digital');
            let localizedCategory = localizedCategoryFallback;
            if (categoryRef?.slug) {
                try {
                    localizedCategory = tMarket(`taxonomy.categories.${categoryRef.slug}` as never);
                } catch {
                    localizedCategory = localizedCategoryFallback;
                }
            }
            const translationStatus = mergeApiContentTranslationStatuses(
                inferStatusFromContentMetadata(locale, p.content_locales, p.content_source_locale),
                categoryRef
                    ? inferStatusFromLocalizedPair(locale, categoryRef.name_en, categoryRef.name_fr)
                    : 'translated',
            );

            return {
                id: p.id,
                slug: p.slug,
                title: p.title,
                creator: p.seller?.shop_name || p.seller?.display_name || 'Anonymous',
                price: `$${p.price}`,
                averageRating: typeof p.average_rating === 'number' ? p.average_rating : null,
                reviewsCount: parseNonNegativeInteger(p.reviews_count),
                tags: p.tags.length > 0 ? p.tags.slice(0, 2) : [localizedCategory],
                translationStatus,
                createdAt: p.createdAt || new Date(0).toISOString(),
                isBundle: Boolean(p.isBundle),
                thumbBg: '#F4F1EA',
                coverImageUrl: p.cover_image_url,
                thumbContent: (
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <div
                            style={{
                                background: '#2B463C',
                                borderRadius: '10px',
                                width: '60px',
                                height: '60px',
                            }}
                        />
                    </div>
                ),
            };
        });
    }, [locale, tMarket]);

    useEffect(() => {
        if (initialProducts && initialProducts.length > 0) {
            setProducts(mapProducts(initialProducts));
            return;
        }
        const fetchProducts = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    limit: String(limit),
                });
                const response = await fetch(`/api/home/products?${params.toString()}`, { method: 'GET' });
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    if (response.status === 503 && isDbUnavailableApiPayload(payload)) {
                        setProducts([]);
                        return;
                    }
                    throw new Error(`Failed to fetch products (${response.status})`);
                }

                const productRows = ((payload as { items?: HomeProductsApiItem[] } | null)?.items) ?? [];
                setProducts(mapProducts(productRows));
            } catch (error) {
                console.error('Error fetching products:', getErrorMessage(error));
                setProducts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [limit, initialProducts, mapProducts]);

    if (!loading && products.length === 0) return null;

    return (
        <section className="mb-24">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    marginBottom: '40px',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}
            >
                <div>
                    <h2
                        style={{
                            fontFamily: 'var(--font-fraunces), serif',
                            fontSize: 'clamp(2rem, 4vw, 2.5rem)',
                            marginBottom: '8px',
                        }}
                    >
                        {title}
                    </h2>
                    <p style={{ color: '#555555', fontSize: '1.1rem', maxWidth: '500px' }}>{t('subtitle')}</p>
                </div>
                <a
                    href={resolvedCtaHref}
                    style={{
                        color: '#1A1A1A',
                        fontWeight: 700,
                        textDecoration: 'none',
                        borderBottom: '2px solid #2B463C',
                    }}
                >
                    {ctaLabel}
                </a>
            </div>

            {loading ? (
                <MarketingGridSkeleton
                    cards={limit}
                    withHero={false}
                    withFilters={false}
                    showResultsHeader={false}
                    cardVariant="product"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </section>
    );
};
