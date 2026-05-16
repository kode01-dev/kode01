'use client';

import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { MarketingGridSkeleton } from '@/components/skeletons';
import type { RecapPostCard } from '@/features/ai-recap/types';
import type { HomepageSectionContent } from '@/features/homepage-layout/types';
import { isDbUnavailableApiPayload } from '@/lib/resilience/db-unavailable';
import { getErrorMessage, getLocalizedSectionValue } from '../helpers';

interface NewsPreviewSectionProps {
    template?: string;
    content?: HomepageSectionContent;
    settings?: Record<string, unknown>;
}

export const NewsPreviewSection = ({
    content,
    settings,
}: NewsPreviewSectionProps) => {
    const t = useTranslations('artifacts_home.news');
    const locale = useLocale();
    const localeCode = locale.startsWith('fr') ? 'fr' : 'en';
    const [posts, setPosts] = useState<RecapPostCard[]>([]);
    const [loading, setLoading] = useState(true);
    const limit = Number.isInteger(settings?.limit) ? Math.min(Math.max(Number(settings?.limit), 1), 12) : 3;
    const title = getLocalizedSectionValue(content, 'title', locale) ?? t('title');
    const subtitle = getLocalizedSectionValue(content, 'subtitle', locale) ?? t('subtitle');
    const ctaLabel = getLocalizedSectionValue(content, 'cta_label', locale) ?? t('view_all');
    const ctaHref = content?.cta_href || '/news';
    const resolvedCtaHref = ctaHref.startsWith('http')
        ? ctaHref
        : `/${locale}${ctaHref.startsWith('/') ? ctaHref : `/${ctaHref}`}`;

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    limit: String(limit),
                    locale: localeCode,
                });
                const response = await fetch(`/api/home/news?${params.toString()}`, { method: 'GET' });
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    if (response.status === 503 && isDbUnavailableApiPayload(payload)) {
                        setPosts([]);
                        return;
                    }
                    throw new Error('Failed to fetch news posts');
                }

                const postsPayload = payload as { items?: RecapPostCard[] } | null;
                setPosts(postsPayload?.items ?? []);
            } catch (err) {
                console.error('Error fetching news posts:', getErrorMessage(err));
                setPosts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
    }, [limit, localeCode]);

    if (!loading && posts.length === 0) return null;

    const featured = posts[0];
    const rest = posts.slice(1);

    return (
        <section className="mb-16 md:mb-24">
            <div
                style={{
                    background: '#1A1A1A',
                    borderRadius: '32px',
                    padding: 'clamp(24px, 5vw, 48px)',
                    position: 'relative',
                    overflow: 'hidden',
                    color: 'white',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '32px',
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
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', maxWidth: '500px' }}>{subtitle}</p>
                    </div>
                    <a
                        href={resolvedCtaHref}
                        style={{
                            color: '#FFFFFF',
                            fontWeight: 700,
                            textDecoration: 'none',
                            borderBottom: '2px solid #F291C8',
                            fontSize: '0.9rem',
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
                        cardVariant="news"
                    />
                ) : (
                    <div>
                        {featured && (
                            <Link
                                href={`/news/${featured.slug}`}
                                className="block mb-4 p-8 rounded-2xl bg-[#2B463C] border border-white/10 transition-all hover:-translate-y-1"
                            >
                                <h3 style={{ fontFamily: 'var(--font-fraunces), serif', fontSize: '1.5rem', marginBottom: '8px' }}>
                                    {featured.title}
                                </h3>
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', lineClamp: 2 }}>
                                    {featured.excerpt || featured.intro}
                                </p>
                            </Link>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {rest.map((post) => (
                                <Link
                                    key={post.id}
                                    href={`/news/${post.slug}`}
                                    className="block p-6 rounded-2xl bg-white/5 border border-white/5 transition-all hover:-translate-y-1"
                                >
                                    <h3
                                        style={{
                                            fontFamily: 'var(--font-fraunces), serif',
                                            fontSize: '1.2rem',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        {post.title}
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineClamp: 2 }}>
                                        {post.excerpt || post.intro}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};