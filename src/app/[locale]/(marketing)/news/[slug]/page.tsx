import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { getRecapPostBySlug, getSiblingRecapPosts } from '@/features/ai-recap/server/repository';
import { getAppBaseUrl } from '@/lib/env/server';
import { Metadata } from 'next';
import { SponsoredPlacementSlot } from '@/components/ads/SponsoredPlacementSlot';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';
import { getPublishedEditorialPosts } from '@/features/editorial/server/repository';
import { CrossRecommendationsSection } from '@/features/recommendations/components/CrossRecommendationsSection';
import { ReactNode } from 'react';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { RecapArticleSources } from '@/features/ai-recap/components/RecapArticleSources';

type ArticleBlock =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'callout'; lines: string[] }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'pre'; text: string };

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function sanitizeMarkdownHref(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || CONTROL_CHARACTER_PATTERN.test(trimmed) || trimmed.startsWith('//')) {
        return null;
    }

    try {
        const parsed = new URL(trimmed, 'https://kode01.local');
        if (parsed.origin === 'https://kode01.local') {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function renderInlineMarkdown(value: string, keyPrefix: string = 'i'): ReactNode[] {
    const parts: ReactNode[] = [];
    let remaining = value;
    let idx = 0;

    while (remaining.length > 0) {
        const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)/);
        const boldMatch = remaining.match(/^([\s\S]*?)\*\*([^*]+)\*\*/);
        const underBoldMatch = remaining.match(/^([\s\S]*?)__([^_]+)__/);
        const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`/);

        const candidates: { pos: number; len: number; pre: string; node: ReactNode }[] = [];

        if (linkMatch) {
            const safeHref = sanitizeMarkdownHref(linkMatch[3]);
            candidates.push({
                pos: linkMatch[1].length,
                len: linkMatch[0].length,
                pre: linkMatch[1],
                node: safeHref
                    ? <a key={`${keyPrefix}-${idx}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-kode01-pink hover:underline">{linkMatch[2]}</a>
                    : <span key={`${keyPrefix}-${idx}`}>{linkMatch[2]}</span>,
            });
        }
        if (boldMatch) {
            candidates.push({
                pos: boldMatch[1].length,
                len: boldMatch[0].length,
                pre: boldMatch[1],
                node: <strong key={`${keyPrefix}-${idx}`} className="font-bold text-kode01-noir">{boldMatch[2]}</strong>,
            });
        }
        if (underBoldMatch) {
            candidates.push({
                pos: underBoldMatch[1].length,
                len: underBoldMatch[0].length,
                pre: underBoldMatch[1],
                node: <strong key={`${keyPrefix}-${idx}`} className="font-bold text-kode01-noir">{underBoldMatch[2]}</strong>,
            });
        }
        if (codeMatch) {
            candidates.push({
                pos: codeMatch[1].length,
                len: codeMatch[0].length,
                pre: codeMatch[1],
                node: <code key={`${keyPrefix}-${idx}`} className="bg-kode01-cream/80 px-1 py-0.5 rounded text-[0.9em] font-mono">{codeMatch[2]}</code>,
            });
        }

        if (candidates.length === 0) {
            if (remaining) parts.push(remaining);
            break;
        }

        candidates.sort((a, b) => a.pos - b.pos);
        const best = candidates[0];

        if (best.pre) parts.push(best.pre);
        parts.push(best.node);
        remaining = remaining.slice(best.len);
        idx++;
    }

    return parts;
}

function cleanInlineToString(value: string) {
    return value
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

const ASCII_BAR_PATTERN = /[█░▓▒■□]/;

function isTableSeparator(line: string) {
    return /^\|?[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
    return line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}

function parseArticleMarkdown(markdown: string, postTitle: string) {
    const lines = markdown.split(/\r?\n/);
    const blocks: ArticleBlock[] = [];
    let paragraphLines: string[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let calloutLines: string[] = [];
    let preLines: string[] = [];
    let firstHeadingHandled = false;

    const flushParagraph = () => {
        if (paragraphLines.length === 0) return;
        const text = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
            blocks.push({ type: 'paragraph', text });
        }
        paragraphLines = [];
    };

    const flushList = () => {
        if (!listType || listItems.length === 0) {
            listType = null;
            listItems = [];
            return;
        }
        blocks.push({ type: listType, items: [...listItems] });
        listType = null;
        listItems = [];
    };

    const flushCallout = () => {
        if (calloutLines.length === 0) return;
        blocks.push({ type: 'callout', lines: [...calloutLines] });
        calloutLines = [];
    };

    const flushPre = () => {
        if (preLines.length === 0) return;
        blocks.push({ type: 'pre', text: preLines.join('\n') });
        preLines = [];
    };

    const flushAll = () => {
        flushParagraph();
        flushList();
        flushCallout();
        flushPre();
    };

    let i = 0;
    while (i < lines.length) {
        const rawLine = lines[i];
        const line = rawLine.trim();

        if (!line) {
            flushAll();
            i++;
            continue;
        }

        // Table detection: look for header + separator + rows
        if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
            flushAll();
            const headers = parseTableRow(line);
            i += 2; // skip header + separator
            const rows: string[][] = [];
            while (i < lines.length) {
                const rowLine = lines[i].trim();
                if (!rowLine || !rowLine.includes('|')) break;
                rows.push(parseTableRow(rowLine));
                i++;
            }
            blocks.push({ type: 'table', headers, rows });
            continue;
        }

        // ASCII data bars / preformatted blocks
        if (ASCII_BAR_PATTERN.test(line)) {
            flushParagraph();
            flushList();
            flushCallout();
            preLines.push(rawLine);
            i++;
            continue;
        }

        // Continue preformatted if previous line was pre and this looks aligned/related
        if (preLines.length > 0 && (line.startsWith('*') === false) && /^\S.*:\s+/.test(line)) {
            preLines.push(rawLine);
            i++;
            continue;
        }
        flushPre();

        // Headings
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            flushAll();
            const headingText = cleanInlineToString(heading[2]);
            if (!firstHeadingHandled) {
                firstHeadingHandled = true;
                if (headingText.toLowerCase() === postTitle.trim().toLowerCase()) {
                    i++;
                    continue;
                }
            }
            blocks.push({ type: 'heading', level: Math.min(4, heading[1].length), text: headingText });
            i++;
            continue;
        }

        // Blockquote / callout lines
        const quoteMatch = line.match(/^>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            calloutLines.push(quoteMatch[1]);
            i++;
            continue;
        }
        flushCallout();

        // Unordered list
        const unordered = line.match(/^[-*]\s+(.+)$/);
        if (unordered) {
            flushParagraph();
            if (listType !== 'ul') {
                flushList();
                listType = 'ul';
            }
            listItems.push(unordered[1]);
            i++;
            continue;
        }

        // Ordered list
        const ordered = line.match(/^\d+\.\s+(.+)$/);
        if (ordered) {
            flushParagraph();
            if (listType !== 'ol') {
                flushList();
                listType = 'ol';
            }
            listItems.push(ordered[1]);
            i++;
            continue;
        }

        // Default: paragraph line
        flushList();
        paragraphLines.push(line);
        i++;
    }

    flushAll();
    return blocks;
}

function renderArticleMarkdown(markdown: string, postTitle: string) {
    const blocks = parseArticleMarkdown(markdown, postTitle);
    return (
        <div className="mt-5 sm:mt-10 space-y-3.5 sm:space-y-5 break-words">
            {blocks.map((block, index) => {
                if (block.type === 'heading') {
                    if (block.level <= 2) {
                        return <h2 key={`h-${index}`} className="text-lg sm:text-2xl font-serif font-black mt-6 sm:mt-8">{block.text}</h2>;
                    }
                    return <h3 key={`h-${index}`} className="text-base sm:text-xl font-serif font-black mt-5 sm:mt-6">{block.text}</h3>;
                }

                if (block.type === 'callout') {
                    return (
                        <blockquote key={`bq-${index}`} className="border-l-4 border-kode01-pink/60 bg-kode01-cream/50 rounded-r-xl pl-4 sm:pl-5 pr-3 sm:pr-4 py-3 sm:py-4 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
                            {block.lines.map((line, li) => (
                                <p key={`bq-${index}-${li}`} className={li > 0 ? 'mt-1.5' : undefined}>
                                    {renderInlineMarkdown(line, `bq-${index}-${li}`)}
                                </p>
                            ))}
                        </blockquote>
                    );
                }

                if (block.type === 'table') {
                    return (
                        <div key={`tbl-${index}`} className="overflow-x-auto -mx-1 sm:mx-0">
                            <table className="w-full text-sm sm:text-base border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-kode01-noir/15">
                                        {block.headers.map((h, hi) => (
                                            <th key={`th-${index}-${hi}`} className="text-left font-bold px-2 sm:px-3 py-2 text-kode01-noir/90">
                                                {renderInlineMarkdown(h, `th-${index}-${hi}`)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {block.rows.map((row, ri) => (
                                        <tr key={`tr-${index}-${ri}`} className={ri % 2 === 0 ? 'bg-kode01-cream/30' : ''}>
                                            {row.map((cell, ci) => (
                                                <td key={`td-${index}-${ri}-${ci}`} className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-kode01-noir/5 text-kode01-noir/80">
                                                    {renderInlineMarkdown(cell, `td-${index}-${ri}-${ci}`)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }

                if (block.type === 'pre') {
                    return (
                        <pre key={`pre-${index}`} className="overflow-x-auto bg-kode01-cream/60 border border-kode01-noir/10 rounded-xl px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm font-mono leading-relaxed text-kode01-noir/85 whitespace-pre">
                            {block.text}
                        </pre>
                    );
                }

                if (block.type === 'ul') {
                    return (
                        <ul key={`ul-${index}`} className="list-disc pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
                            {block.items.map((item, itemIndex) => (
                                <li key={`ul-${index}-${itemIndex}`}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>
                            ))}
                        </ul>
                    );
                }

                if (block.type === 'ol') {
                    return (
                        <ol key={`ol-${index}`} className="list-decimal pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-sm sm:text-base leading-relaxed text-kode01-noir/85">
                            {block.items.map((item, itemIndex) => (
                                <li key={`ol-${index}-${itemIndex}`}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>
                            ))}
                        </ol>
                    );
                }

                return (
                    <p key={`p-${index}`} className="text-sm sm:text-base leading-relaxed text-kode01-noir/85">
                        {renderInlineMarkdown(block.text, `p-${index}`)}
                    </p>
                );
            })}
        </div>
    );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
    const { locale, slug } = await params;
    const post = await getRecapPostBySlug(slug);

    if (!post) {
        return { title: 'Not Found' };
    }

    const baseUrl = getAppBaseUrl();

    return applySeoMetadata({
        title: post.title,
        description: post.excerpt ?? post.intro,
        openGraph: {
            title: post.title,
            description: post.excerpt ?? post.intro,
            type: 'article',
        },
        alternates: {
            canonical: `${baseUrl}/${locale}/news/${slug}`,
        },
    }, '/news/[slug]', { locale, slug });
}

export default async function NewsDetailPage({
    params,
}: {
    params: Promise<{ locale: string; slug: string }>;
}) {
    const { slug, locale } = await params;
    const post = await getRecapPostBySlug(slug);
    if (!post) {
        notFound();
    }

    const [siblingPosts, recommendedBlogResult] = await Promise.all([
        getSiblingRecapPosts(post.edition_id, post.slug),
        getPublishedEditorialPosts({
            locale: locale as 'en' | 'fr',
            page: 1,
            pageSize: 4,
        }),
    ]);
    const { data: recommendedBlogPosts } = recommendedBlogResult;
    const content = post.content_json;
    const isFrench = locale.toLowerCase().startsWith('fr');
    const summaryTitle = isFrench ? 'Ce qu’il faut retenir en 30 secondes' : 'What to know in 30 seconds';
    const summarySourceLabel = isFrench ? 'Source principale' : 'Primary source';
    const quickHitsTitle = isFrench ? 'En bref' : 'Quick hits';
    const articleFallback = isFrench
        ? 'Article en cours de generation. Revenez dans quelques minutes.'
        : 'Article is still being generated. Please check back in a few minutes.';
    const summaryLocale = isFrench ? content?.summary30s?.fr : content?.summary30s?.en;
    const summaryItems = summaryLocale?.bullets?.length
        ? summaryLocale.bullets.slice(0, 3)
        : content
            ? [
                content.bigNews?.name && content.bigNews?.impact
                    ? `${content.bigNews.name}: ${content.bigNews.impact}`
                    : null,
                ...content.quickHits.map((item) => `${item.topic}: ${item.summary}`),
            ].filter((value): value is string => Boolean(value)).slice(0, 3)
            : [];
    const summaryPrimarySourceUrl = summaryLocale?.primary_source_url || content?.bigNews?.source_url || null;
    const translationStatus = inferStatusFromContentMetadata(locale, null, post.locale);
    const displayTranslationStatus =
        translationStatus === 'not_translated' ? 'translated' : translationStatus;
    const baseUrl = getAppBaseUrl();
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt ?? post.intro,
        datePublished: post.published_at ?? undefined,
        inLanguage: locale,
        mainEntityOfPage: `${baseUrl}/${locale}/news/${slug}`,
    };

    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans overflow-x-hidden">
            <SeoAppJsonLd pathname={`/news/${slug}`} fallbackData={jsonLd} />
            <BaseHeader />
            <main className="flex-1 min-w-0 pt-28 sm:pt-32 pb-8 sm:pb-14 mx-auto max-w-7xl px-3.5 sm:px-6 w-full overflow-hidden">
                <div className="mb-5 sm:mb-8">
                    <Link
                        href="/news"
                        className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/50 no-underline hover:text-kode01-pink flex items-center gap-1.5 sm:gap-2 transition-colors group"
                    >
                        <span className="transition-transform group-hover:-translate-x-1">&larr;</span> Back to news
                    </Link>
                </div>

                <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_320px] min-w-0 items-start">
                    <div className="min-w-0">
                        <div className="mb-5 lg:hidden">
                            <SponsoredPlacementSlot
                                placement="news"
                                locale={locale}
                                pagePath={`/${locale}/news/${slug}`}
                                layout="banner"
                                showPlaceholderWhenEmpty
                                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
                            />
                        </div>

                        <article className="rounded-2xl sm:rounded-3xl border border-black/10 bg-white/85 p-4 sm:p-10 overflow-hidden">
                            <header>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    <span className="rounded-full bg-kode01-noir px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                                        {post.locale}
                                    </span>
                                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {post.published_at ? new Date(post.published_at).toLocaleDateString(locale, { dateStyle: 'long' }) : 'Draft'}
                                    </span>
                                </div>
                                {post.tags && (post.tags as string[]).length > 0 && (
                                    <div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-2">
                                        {(post.tags as string[]).map((tag) => (
                                            <span
                                                key={tag}
                                                className="rounded-lg border border-black/5 bg-kode01-cream px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] font-bold uppercase tracking-wider text-kode01-noir/60"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <h1 className="mt-3 sm:mt-4 text-xl sm:text-4xl font-serif font-black leading-tight tracking-tight break-words">{post.title}</h1>
                                <ApiContentStatusBadge
                                    status={displayTranslationStatus}
                                    locale={locale}
                                    className="mt-3 sm:mt-4"
                                />
                                <p className="mt-4 sm:mt-5 text-sm sm:text-base text-kode01-noir/75 leading-relaxed">{post.intro}</p>
                            </header>

                            {summaryItems.length > 0 && (
                                <section className="mt-5 sm:mt-10 rounded-xl sm:rounded-2xl border border-black/10 bg-kode01-cream/70 p-3.5 sm:p-6">
                                    <h2 className="text-sm sm:text-lg font-serif font-black">{summaryTitle}</h2>
                                    <p className="mt-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-kode01-noir/45">{quickHitsTitle}</p>
                                    <ul className="mt-2.5 sm:mt-3 list-disc pl-4 sm:pl-5 space-y-1.5 sm:space-y-2 text-[13px] sm:text-sm leading-relaxed text-kode01-noir/85">
                                        {summaryItems.map((item, index) => (
                                            <li key={`summary-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                    {summaryPrimarySourceUrl && (
                                        <p className="mt-3 sm:mt-4 text-[10px] sm:text-xs font-medium text-kode01-noir/50 break-words overflow-hidden">
                                            {summarySourceLabel}:{' '}
                                            <a
                                                href={summaryPrimarySourceUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-kode01-pink hover:underline break-all"
                                            >
                                                {summaryPrimarySourceUrl}
                                            </a>
                                        </p>
                                    )}
                                </section>
                            )}

                            {post.content_markdown?.trim().length > 0 ? (
                                renderArticleMarkdown(post.content_markdown, post.title)
                            ) : (
                                <p className="mt-8 text-sm text-kode01-noir/65">{articleFallback}</p>
                            )}

                            <RecapArticleSources content={content} locale={locale} />
                        </article>

                        <div className="mt-6 sm:mt-8 lg:hidden">
                            <SponsoredPlacementSlot
                                placement="news"
                                locale={locale}
                                pagePath={`/${locale}/news/${slug}`}
                                layout="banner"
                                showPlaceholderWhenEmpty
                                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
                            />
                        </div>

                        {siblingPosts.length > 0 && (
                            <aside className="mt-6 sm:mt-8 rounded-2xl sm:rounded-3xl border border-black/10 bg-white/70 p-4 sm:p-6 overflow-hidden">
                                <h2 className="text-base sm:text-lg font-serif font-black">Other language edition</h2>
                                <ul className="mt-3 sm:mt-4 list-none p-0 space-y-2">
                                    {siblingPosts.map((item) => (
                                        <li key={item.id}>
                                            <Link href={`/news/${item.slug}`} locale={item.locale as 'en' | 'fr'} className="text-sm sm:text-base font-bold text-kode01-noir hover:text-kode01-pink break-words">
                                                [{item.locale.toUpperCase()}] {item.title}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </aside>
                        )}

                        {recommendedBlogPosts.length > 0 && (
                            <div className="mt-6 sm:mt-8">
                                <CrossRecommendationsSection
                                    locale={locale}
                                    type="news-to-blog"
                                    sourceSlug={slug}
                                    items={recommendedBlogPosts}
                                    limit={4}
                                />
                            </div>
                        )}
                    </div>

                    <aside className="hidden lg:block">
                        <div className="sticky top-28">
                            <SponsoredPlacementSlot
                                placement="news"
                                locale={locale}
                                pagePath={`/${locale}/news/${slug}`}
                                layout="sidebar"
                                showPlaceholderWhenEmpty
                                fallbackAdSenseSlot="THIKI_NEWS_DETAIL_SLOT"
                            />
                        </div>
                    </aside>
                </div >
            </main >
            <BaseFooter />
        </div >
    );
}
