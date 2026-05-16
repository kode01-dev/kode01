'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { MarketingGridSkeleton } from '@/components/skeletons';
import type { HomepageSectionContent, HomepageTopDealItem } from '@/features/homepage-layout/types';
import { getLocalizedSectionValue } from '../helpers';

interface TopDealsSectionProps {
    template?: string;
    content?: HomepageSectionContent;
    settings?: Record<string, unknown>;
    initialTopDeals?: HomepageTopDealItem[];
}

export const TopDealsSection = ({
    content,
    settings,
    initialTopDeals,
}: TopDealsSectionProps) => {
    const locale = useLocale();
    const tMarket = useTranslations('market');
    const [items, setItems] = useState<HomepageTopDealItem[]>(initialTopDeals ?? []);
    const [loading, setLoading] = useState(!initialTopDeals);
    const isFrench = locale.startsWith('fr');
    const limit = Number.isInteger(settings?.limit) ? Math.min(Math.max(Number(settings?.limit), 1), 24) : 6;
    const days = Number.isInteger(settings?.window_days)
        ? Math.min(Math.max(Number(settings?.window_days), 1), 90)
        : 7;

    const title = getLocalizedSectionValue(content, 'title', locale) ?? (isFrench ? 'Top Ventes' : 'Top Deals');
    const subtitle = getLocalizedSectionValue(content, 'subtitle', locale)
        ?? (isFrench ? `Meilleures ventes sur ${days} jours` : `Best sellers over the last ${days} days`);
    const ctaLabel = getLocalizedSectionValue(content, 'cta_label', locale) ?? (isFrench ? 'Voir tout' : 'View all');
    const ctaHref = content?.cta_href || '/market';
    const resolvedCtaHref = ctaHref.startsWith('http') ? ctaHref : `/${locale}${ctaHref.startsWith('/') ? ctaHref : `/${ctaHref}`}`;

    useEffect(() => {
        if (initialTopDeals) return;
        const fetchTopDeals = async () => {
            setLoading(true);
            try {
                const response = await fetch(`/api/home/top-deals?limit=${limit}&days=${days}`);
                if (response.ok) {
                    const data = await response.json();
                    setItems(data.items || []);
                }
            } catch (err) {
                console.error('Error fetching top deals:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchTopDeals();
    }, [days, limit, initialTopDeals]);

    if (!loading && items.length === 0) return null;

    return (
        <section className="mb-16 md:mb-24">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: 'clamp(2rem, 4vw, 2.5rem)', marginBottom: '8px' }}>{title}</h2>
                    <p style={{ color: '#555555', fontSize: '1.1rem', maxWidth: '520px' }}>{subtitle}</p>
                </div>
                <a href={resolvedCtaHref} style={{ color: '#1A1A1A', fontWeight: 700, textDecoration: 'none', borderBottom: '2px solid #2B463C' }}>{ctaLabel}</a>
            </div>

            {loading ? (
                <MarketingGridSkeleton cards={limit} withHero={false} withFilters={false} showResultsHeader={false} cardVariant="product" />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {items.map((item) => {
                        const createdMs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
                        const isNew = createdMs > 0 && (new Date().getTime() - createdMs < 14 * 24 * 60 * 60 * 1000);
                        return (
                            <Link key={item.id} href={`/products/${item.slug}`} className="block rounded-3xl border border-black/10 bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-lg">
                                <div className="h-40 rounded-2xl relative overflow-hidden bg-kode01-cream mb-4" style={{ backgroundImage: item.cover_image_url ? `url(${item.cover_image_url})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                    <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {item.isBundle && (
                                            <span style={{ padding: '4px 12px', borderRadius: '999px', background: 'rgba(255,105,180,0.9)', color: '#1A1A1A', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', backdropFilter: 'blur(4px)' }}>
                                                {tMarket('card.bundle')}
                                            </span>
                                        )}
                                        {isNew && (
                                            <span style={{ padding: '4px 12px', borderRadius: '999px', background: '#2B463C', color: 'white', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                                {tMarket('card.new')}
                                            </span>
                                        )}
                                        <span style={{ padding: '4px 12px', borderRadius: '999px', background: '#FF69B4', color: '#1A1A1A', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                            {tMarket('card.popular')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-bold text-kode01-noir/50">{item.sales_count} {isFrench ? 'ventes' : 'sales'}</span>
                                </div>
                                <h3 className="text-xl font-serif font-black line-clamp-2">{item.title}</h3>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
};