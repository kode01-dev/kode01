'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Search } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import type { HomepageSectionContent } from '@/features/homepage-layout/types';
import { getLocalizedSectionValue, roundStatic } from '../helpers';
import { fetchHomeStatsWithCache } from '../stats-client-cache';
import type { HomeStatsData } from '@/features/homepage/lib/homepage-data-server';

interface HeroSectionProps {
    template?: string;
    content?: HomepageSectionContent;
    initialStats?: HomeStatsData;
}

export const HeroSection = ({ content, initialStats }: HeroSectionProps) => {
    const t = useTranslations('artifacts_home.hero');
    const locale = useLocale();
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState<{ assets: number; creators: number; totalSales: number }>(() => {
        if (initialStats) {
            return {
                assets: initialStats.productsAndArticles,
                creators: initialStats.creators,
                totalSales: initialStats.totalSales,
            };
        }
        return {
            assets: 0,
            creators: 0,
            totalSales: 0,
        };
    });
    const router = useRouter();
    const customTitle = getLocalizedSectionValue(content, 'title', locale);
    const customSubtitle = getLocalizedSectionValue(content, 'subtitle', locale);
    const customCta = getLocalizedSectionValue(content, 'cta_label', locale);

    useEffect(() => {
        if (initialStats) return;
        let isMounted = true;

        const fetchStats = async () => {
            try {
                const data = await fetchHomeStatsWithCache();
                if (isMounted) {
                    setStats({
                        assets: data.productsAndArticles,
                        creators: data.creators,
                        totalSales: data.totalSales,
                    });
                }
            } catch (err) {
                console.error('Failed to fetch hero stats:', err);
            }
        };
        fetchStats();

        return () => {
            isMounted = false;
        };
    }, [initialStats]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <section className="hero-section">
            <style>{`
                .hero-section {
                    padding: clamp(140px, 20vw, 260px) clamp(20px, 4vw, 48px) clamp(32px, 6vw, 64px);
                    position: relative;
                }
                .hero-center {
                    max-width: 720px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    gap: 28px;
                }
                .hero-search-btn-text { display: inline; }
                .hero-search-btn-icon { display: none; }
                @media (max-width: 480px) {
                    .hero-section {
                        padding-top: 160px;
                    }
                    .hero-search-btn-text { display: none !important; }
                    .hero-search-btn-icon { display: inline-flex !important; }
                }
            `}</style>
            <div className="hero-center">
                <h1
                    style={{
                        fontFamily: 'var(--font-fraunces), serif',
                        fontSize: 'clamp(2.8rem, 7vw, 5rem)',
                        lineHeight: 1,
                        fontWeight: 900,
                        letterSpacing: '-0.04em',
                        color: '#1A1A1A',
                    }}
                >
                    {customTitle ?? (
                        <>
                            {t('heading_line1')}
                            <br />
                            {t('heading_line2')}
                        </>
                    )}
                </h1>
                <p
                    style={{
                        fontSize: 'clamp(1rem, 1.8vw, 1.15rem)',
                        color: '#888888',
                        maxWidth: '560px',
                        lineHeight: 1.6,
                    }}
                >
                    {customSubtitle ?? t('subtitle')}
                </p>

                <form onSubmit={handleSearch} style={{ width: '100%', maxWidth: '560px' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#FFFFFF',
                            borderRadius: '999px',
                            padding: '8px 8px 8px clamp(14px, 4vw, 24px)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                            border: '1px solid rgba(0,0,0,0.1)',
                            minWidth: 0,
                        }}
                    >
                        <Search color="#555555" size={20} style={{ flexShrink: 0 }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('search_placeholder')}
                            suppressHydrationWarning
                            style={{
                                flex: 1,
                                minWidth: 0,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                padding: 'clamp(8px, 2vw, 12px) clamp(8px, 2vw, 16px)',
                                fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
                                fontFamily: 'var(--font-dm-sans), sans-serif',
                                color: '#1A1A1A',
                            }}
                        />
                        <button
                            type="submit"
                            suppressHydrationWarning
                            style={{
                                background: '#1A1A1A',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '999px',
                                padding: 'clamp(10px, 2vw, 14px) clamp(14px, 3vw, 28px)',
                                fontWeight: 700,
                                fontSize: 'clamp(0.85rem, 2vw, 1.05rem)',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-dm-sans), sans-serif',
                                transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                whiteSpace: 'nowrap' as const,
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.05)')}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                        >
                            <span className="hero-search-btn-text">{customCta ?? t('explore_assets')}</span>
                            <ArrowRight size={20} className="hero-search-btn-icon" />
                        </button>
                    </div>
                </form>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '24px',
                        flexWrap: 'wrap',
                    }}
                >
                    <span
                        style={{ fontSize: '0.8rem', fontWeight: 600, color: '#AAAAAA', letterSpacing: '0.05em' }}
                    >
                        {t('proof_assets', { count: roundStatic(stats.assets, locale) })}
                    </span>
                    <span style={{ color: '#D5D5D5', fontSize: '0.7rem' }}>{'\u2022'}</span>
                    <span
                        style={{ fontSize: '0.8rem', fontWeight: 600, color: '#AAAAAA', letterSpacing: '0.05em' }}
                    >
                        {t('proof_creators', { count: roundStatic(stats.creators, locale) })}
                    </span>
                    <span style={{ color: '#D5D5D5', fontSize: '0.7rem' }}>{'\u2022'}</span>
                    <span
                        style={{ fontSize: '0.8rem', fontWeight: 600, color: '#AAAAAA', letterSpacing: '0.05em' }}
                    >
                        {t('proof_sales', { count: roundStatic(stats.totalSales, locale) })}
                    </span>
                </div>
            </div>
        </section>
    );
};
