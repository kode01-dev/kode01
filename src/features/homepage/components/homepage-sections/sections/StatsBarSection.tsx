'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseNonNegativeInteger } from '../helpers';
import {
    fetchHomeStatsWithCache,
    fetchNewsletterStatsWithCache,
} from '../stats-client-cache';
import type { HomeStatsData } from '@/features/homepage/lib/homepage-data-server';

interface StatsBarSectionProps {
    template?: string;
    initialStats?: HomeStatsData;
}

export const StatsBarSection = ({ template = 'band', initialStats }: StatsBarSectionProps) => {
    const t = useTranslations('artifacts_home.stats');
    const locale = useLocale();
    const [counts, setCounts] = useState(() => ({
        newsletter: 0,
        productsAndArticles: initialStats?.productsAndArticles ?? 0,
        creators: initialStats?.creators ?? 0,
        totalSales: initialStats?.totalSales ?? 0,
    }));

    useEffect(() => {
        let isMounted = true;
        const fetchStats = async () => {
            try {
                const [newsData, homeData] = await Promise.all([
                    fetchNewsletterStatsWithCache(),
                    fetchHomeStatsWithCache(),
                ]);

                if (isMounted) {
                    setCounts({
                        newsletter: parseNonNegativeInteger(newsData.subscribers),
                        productsAndArticles: homeData.productsAndArticles || initialStats?.productsAndArticles || 0,
                        creators: homeData.creators || initialStats?.creators || 0,
                        totalSales: homeData.totalSales || initialStats?.totalSales || 0,
                    });
                }
            } catch (err) {
                console.error('Error fetching stats:', err);
            }
        };
        fetchStats();
        return () => {
            isMounted = false;
        };
    }, [initialStats]);

    const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
    const resolveLabel = (key: string, fallback: string) => {
        try {
            const value = t(key as never);
            if (typeof value === 'string' && value.trim().length > 0) {
                return value;
            }
        } catch {
            // Missing translation should not hide stats labels.
        }
        return fallback;
    };

    const newsletterFallback = locale.startsWith('fr')
        ? "Abonnes a l'infolettre"
        : 'Newsletter Subscribers';

    const stats = [
        {
            value: formatCount(counts.newsletter),
            label: resolveLabel('rev_label', newsletterFallback),
        },
        {
            value: formatCount(counts.productsAndArticles),
            label: resolveLabel(
                'assets_label',
                locale.startsWith('fr') ? 'Produits + articles sur le site' : 'Products + Articles on Site',
            ),
        },
        {
            value: formatCount(counts.creators),
            label: resolveLabel('creators_label', locale.startsWith('fr') ? 'Createurs' : 'Creators'),
        },
        {
            value: formatCount(counts.totalSales),
            label: resolveLabel('sales_label', locale.startsWith('fr') ? 'Ventes' : 'Sales'),
        },
    ];

    const cardsTemplate = template === 'cards';

    return (
        <section className={cardsTemplate ? 'grid grid-cols-1 md:grid-cols-4 gap-4 mb-12 md:mb-24' : 'bg-[#2B463C] rounded-[24px] md:rounded-[32px] p-6 sm:p-8 md:p-16 text-white grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 md:gap-10 text-center relative overflow-hidden mb-12 md:mb-24'}>
            {!cardsTemplate && (
                <>
                    <div style={{ position: 'absolute', top: '-50px', left: '-50px', width: '150px', height: '150px', background: '#F291C8', borderRadius: '50%', opacity: 0.2 }} />
                    <p className="col-span-full text-center text-white/70 text-sm mb-4 md:mb-2 max-w-lg mx-auto leading-relaxed">{t('trust_tagline')}</p>
                </>
            )}
            {stats.map((stat, index) => (
                <div key={index} className={
                    cardsTemplate 
                        ? 'rounded-2xl border border-black/10 bg-white p-6 text-center' 
                        : 'flex flex-col items-center justify-center'
                }>
                    <h3 style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginBottom: '4px', color: cardsTemplate ? '#1A1A1A' : '#FFFFFF' }}>{stat.value}</h3>
                    <p style={{ opacity: cardsTemplate ? 1 : 0.8, fontSize: '0.95rem', color: cardsTemplate ? '#555555' : '#FFFFFF', lineHeight: '1.4' }}>{stat.label}</p>
                </div>
            ))}
        </section>
    );
};

