'use client';

import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { MarketingGridSkeleton } from '@/components/skeletons';
import { ClapCount } from '@/features/claps/components/ClapCount';
import { EditorialClickTracker } from '@/features/editorial/components/EditorialClickTracker';
import type { EditorialPostListItem } from '@/features/editorial/types';
import type { HomepageSectionContent } from '@/features/homepage-layout/types';
import { isDbUnavailableApiPayload } from '@/lib/resilience/db-unavailable';
import { getErrorMessage, getLocalizedSectionValue } from '../helpers';

interface BlogPreviewSectionProps {
    template?: string;
    content?: HomepageSectionContent;
    settings?: Record<string, unknown>;
}

export const BlogPreviewSection = ({
    content,
    settings,
}: BlogPreviewSectionProps) => {
    const t = useTranslations('artifacts_home.blog');
    const locale = useLocale();
    const localeCode = locale.startsWith('fr') ? 'fr' : 'en';
    const [posts, setPosts] = useState<EditorialPostListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const limit = Number.isInteger(settings?.limit) ? Math.min(Math.max(Number(settings?.limit), 1), 12) : 3;
    const title = getLocalizedSectionValue(content, 'title', locale) ?? t('title');
    const subtitle = getLocalizedSectionValue(content, 'subtitle', locale) ?? t('subtitle');
    const ctaLabel = getLocalizedSectionValue(content, 'cta_label', locale) ?? t('view_all');
    const ctaHref = content?.cta_href || '/blog';

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    limit: String(limit),
                    locale: localeCode,
                });
                const response = await fetch(`/api/home/blog?${params.toString()}`, { method: 'GET' });
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    if (response.status === 503 && isDbUnavailableApiPayload(payload)) {
                        setPosts([]);
                        return;
                    }
                    throw new Error('Failed to fetch blog posts');
                }

                const postsPayload = payload as { items?: EditorialPostListItem[] } | null;
                setPosts(postsPayload?.items ?? []);
            } catch (err) {
                console.error('Error fetching blog posts:', getErrorMessage(err));
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
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl sm:text-4xl font-serif font-black text-kode01-noir">{title}</h2>
                    <p className="mt-2 max-w-xl text-kode01-noir/60">{subtitle}</p>
                    <div className="mt-4 h-1 w-16 rounded-full bg-kode01-sauge" />
                </div>
                <Link
                    href={ctaHref}
                    className="text-sm font-bold uppercase tracking-widest text-kode01-sauge no-underline border-b-2 border-kode01-sauge hover:text-kode01-noir transition-colors"
                >
                    {ctaLabel}
                </Link>
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
                    {/* Featured post */}
                    {featured && (
                        <article className="group mb-10 rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(138,154,91,0.15)] hover:border-kode01-sauge/30 hover:-translate-y-1">
                            <div className="flex flex-col md:flex-row">
                                <div className="relative md:w-2/5 h-56 md:h-auto bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60">
                                    {featured.cover_image_url ? (
                                        <Image
                                            src={featured.cover_image_url}
                                            alt={featured.title}
                                            fill
                                            className="object-cover"
                                            sizes="(min-width: 768px) 40vw, 100vw"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                            <div
                                                className="absolute inset-0 opacity-[0.04]"
                                                style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                            />
                                            <span className="relative text-lg font-bold tracking-widest text-white/90">kode01.blog</span>
                                        </div>
                                    )}
                                </div>
                                <div className="relative flex-1 p-5 sm:p-8">
                                    <div className="absolute top-5 right-3 sm:top-8 sm:right-6">
                                        <ClapCount totalClaps={featured.clap_count ?? 0} />
                                    </div>
                                    <span className="inline-block rounded-full bg-kode01-sauge/10 border border-kode01-sauge/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-sauge mb-3">
                                        {t('featured')}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-3 mb-3">
                                        {featured.is_sponsored && (
                                            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                                {t('sponsored_badge')}
                                            </span>
                                        )}
                                        <span className="rounded-full bg-kode01-noir px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                                            {featured.locale}
                                        </span>
                                        <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                                            {featured.published_at
                                                ? new Date(featured.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                                                : t('draft')}
                                            {featured.author_name && (
                                                <span className="ml-2 lowercase opacity-60">
                                                    • {t('by')} {featured.author_name}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <h2 className="text-2xl sm:text-3xl font-serif font-black leading-tight">
                                        <EditorialClickTracker postId={featured.id} className="inline-block">
                                            <Link href={`/blog/${featured.slug}`} className="no-underline text-kode01-noir hover:text-kode01-sauge">
                                                {featured.title}
                                            </Link>
                                        </EditorialClickTracker>
                                    </h2>
                                    <p className="mt-4 text-sm sm:text-base text-kode01-noir/70 leading-relaxed line-clamp-4">
                                        {featured.excerpt ?? t('no_excerpt')}
                                    </p>
                                    <div className="mt-6 flex items-center gap-4">
                                        <EditorialClickTracker postId={featured.id} className="inline-block">
                                            <Link
                                                href={`/blog/${featured.slug}`}
                                                className="inline-flex items-center gap-2 text-sm font-bold text-kode01-sauge no-underline hover:text-kode01-noir transition-colors"
                                            >
                                                {t('read_article')} <span>&rarr;</span>
                                            </Link>
                                        </EditorialClickTracker>
                                    </div>
                                </div>
                            </div>
                        </article>
                    )}

                    {/* Post grid */}
                    {rest.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {rest.map((post) => (
                                <article
                                    key={post.id}
                                    className="group rounded-2xl sm:rounded-3xl border border-black/10 bg-white/80 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_50px_rgba(138,154,91,0.15)] hover:border-kode01-sauge/30 hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="relative h-44 bg-gradient-to-br from-kode01-sauge/80 to-kode01-sauge/60">
                                        {post.cover_image_url ? (
                                            <Image
                                                src={post.cover_image_url}
                                                alt={post.title}
                                                fill
                                                className="object-cover"
                                                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                                <div
                                                    className="absolute inset-0 opacity-[0.04]"
                                                    style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                                />
                                                <span className="relative text-sm font-bold tracking-widest text-white/90">kode01.blog</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="relative p-4 sm:p-6 flex flex-col flex-1">
                                        <div className="absolute top-4 right-3 sm:top-6 sm:right-5">
                                            <ClapCount totalClaps={post.clap_count ?? 0} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            {post.is_sponsored && (
                                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                                    {t('sponsored_badge')}
                                                </span>
                                            )}
                                            {post.category && (
                                                <span className="rounded-full border border-kode01-sauge/35 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                                                    {post.category}
                                                </span>
                                            )}
                                            <span className="rounded-full bg-kode01-noir px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                                                {post.locale}
                                            </span>
                                            <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                                                {post.published_at
                                                    ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' })
                                                    : t('draft')}
                                                {post.author_name && (
                                                    <span className="ml-2 lowercase opacity-60">
                                                        • {t('by')} {post.author_name}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <h2 className="mt-3 text-lg sm:text-xl font-serif font-black line-clamp-2">
                                            <EditorialClickTracker postId={post.id} className="inline-block">
                                                <Link href={`/blog/${post.slug}`} className="no-underline text-kode01-noir hover:text-kode01-sauge">
                                                    {post.title}
                                                </Link>
                                            </EditorialClickTracker>
                                        </h2>
                                        <p className="mt-3 text-sm text-kode01-noir/70 leading-relaxed line-clamp-3 flex-1">
                                            {post.excerpt ?? t('no_excerpt')}
                                        </p>
                                        <div className="mt-4 pt-3 border-t border-black/5">
                                            <EditorialClickTracker postId={post.id} className="inline-block">
                                                <Link
                                                    href={`/blog/${post.slug}`}
                                                    className="text-xs font-bold uppercase tracking-widest text-kode01-sauge no-underline hover:text-kode01-noir transition-colors"
                                                >
                                                    {t('read_article')} &rarr;
                                                </Link>
                                            </EditorialClickTracker>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
