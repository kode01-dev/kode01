import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { Badge } from '@/components/ui/badge';
import { getPublishedRecapPosts } from '@/features/ai-recap/server/repository';
import {
    ApiContentTranslationStatus,
    inferStatusFromContentMetadata,
    inferStatusFromLocalizedPair,
    mergeApiContentTranslationStatuses,
} from '@/lib/i18n/api-content-status';
import { scoreSearchQuery } from '@/lib/search';
import { applySeoMetadata } from '@/lib/seo';
import { createClient } from '@/lib/supabase/server';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';
import { Search, Newspaper, Package, Zap } from 'lucide-react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

interface ProductSearchRow {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    content_locales: string[] | null;
    content_source_locale: 'fr' | 'en' | null;
    category: string | null;
    category_ref:
    | { slug: string; name_en: string | null; name_fr: string | null }
    | { slug: string; name_en: string | null; name_fr: string | null }[]
    | null;
    subcategory_ref:
    | { slug: string; name_en: string | null; name_fr: string | null }
    | { slug: string; name_en: string | null; name_fr: string | null }[]
    | null;
    tags: unknown;
    price: number | null;
}

interface ProductSearchResult {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string | null;
    tags: string[];
    price: number | null;
    score: number;
    translationStatus: ApiContentTranslationStatus;
}

interface NewsSearchResult {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    publishedAt: string | null;
    score: number;
    translationStatus: ApiContentTranslationStatus;
}

function normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return tags.filter((value): value is string => typeof value === 'string');
}

function formatPrice(price: number | null, locale: string): string {
    const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
        style: 'currency',
        currency: 'CAD',
        maximumFractionDigits: 0,
    });
    return formatter.format(price ?? 0);
}

async function getPublishedProductsForSearch(): Promise<ProductSearchRow[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('products')
        .select(`
            id,
            slug,
            title,
            description,
            content_locales,
            content_source_locale,
            category,
            tags,
            price,
            category_ref:product_categories!products_category_id_fkey (
                slug,
                name_en,
                name_fr
            ),
            subcategory_ref:product_subcategories!products_subcategory_id_fkey (
                slug,
                name_en,
                name_fr
            )
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(500);

    if (error || !data) {
        console.error('Failed to fetch products for global search:', error);
        return [];
    }

    return data as ProductSearchRow[];
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'global_search' });

    return applySeoMetadata({
        title: t('meta_title'),
        description: t('meta_description'),
    }, '/search', { locale });
}

export default async function SearchPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ q?: string }>;
}) {
    const { locale } = await params;
    const resolvedSearchParams = await searchParams;
    const query = (resolvedSearchParams.q ?? '').trim();

    const t = await getTranslations({ locale, namespace: 'global_search' });
    const tMarket = PUBLIC_MARKETPLACE_ENABLED
        ? await getTranslations({ locale, namespace: 'market' })
        : null;

    const [products, newsPosts] = await Promise.all([
        PUBLIC_MARKETPLACE_ENABLED ? getPublishedProductsForSearch() : Promise.resolve([]),
        getPublishedRecapPosts(200),
    ]);

    const productResults: ProductSearchResult[] = PUBLIC_MARKETPLACE_ENABLED && query
        ? products
            .map((product): ProductSearchResult | null => {
                if (!product.slug || !product.title) return null;

                const tags = normalizeTags(product.tags);
                const categoryRef = Array.isArray(product.category_ref)
                    ? product.category_ref[0]
                    : product.category_ref;
                const subcategoryRef = Array.isArray(product.subcategory_ref)
                    ? product.subcategory_ref[0]
                    : product.subcategory_ref;
                const categoryLabelFallback = locale === 'fr'
                    ? (categoryRef?.name_fr || categoryRef?.name_en || product.category || '')
                    : (categoryRef?.name_en || categoryRef?.name_fr || product.category || '');
                const categoryLabel = categoryRef?.slug
                    ? (() => {
                        try {
                            return tMarket?.(`taxonomy.categories.${categoryRef.slug}` as never) ?? categoryLabelFallback;
                        } catch {
                            return categoryLabelFallback;
                        }
                    })()
                    : categoryLabelFallback;
                const subcategoryLabelFallback = locale === 'fr'
                    ? (subcategoryRef?.name_fr || subcategoryRef?.name_en || '')
                    : (subcategoryRef?.name_en || subcategoryRef?.name_fr || '');
                const subcategoryLabel = subcategoryRef?.slug
                    ? (() => {
                        try {
                            return tMarket?.(`taxonomy.subcategories.${subcategoryRef.slug}` as never) ?? subcategoryLabelFallback;
                        } catch {
                            return subcategoryLabelFallback;
                        }
                    })()
                    : subcategoryLabelFallback;
                const contentTranslationStatus = inferStatusFromContentMetadata(
                    locale,
                    product.content_locales,
                    product.content_source_locale,
                );
                const categoryTranslationStatus = categoryRef
                    ? inferStatusFromLocalizedPair(locale, categoryRef.name_en, categoryRef.name_fr)
                    : 'translated';
                const subcategoryTranslationStatus = subcategoryRef
                    ? inferStatusFromLocalizedPair(locale, subcategoryRef.name_en, subcategoryRef.name_fr)
                    : 'translated';
                const translationStatus = mergeApiContentTranslationStatuses(
                    contentTranslationStatus,
                    categoryTranslationStatus,
                    subcategoryTranslationStatus,
                );
                const score = scoreSearchQuery(query, [
                    { value: product.title, weight: 6.2 },
                    { value: product.slug, weight: 5.5 },
                    { value: product.category, weight: 3.8 },
                    { value: categoryLabel, weight: 4.0 },
                    { value: categoryRef?.slug, weight: 3.6 },
                    { value: subcategoryLabel, weight: 3.5 },
                    { value: subcategoryRef?.slug, weight: 3.2 },
                    { value: tags.join(' '), weight: 3.8 },
                    { value: product.description, weight: 2.5 },
                ]);

                if (score === null) return null;

                return {
                    id: product.id,
                    slug: product.slug,
                    title: product.title,
                    description: product.description ?? '',
                    category: subcategoryLabel ? `${categoryLabel} / ${subcategoryLabel}` : categoryLabel,
                    tags,
                    price: product.price,
                    score,
                    translationStatus,
                };
            })
            .filter((result): result is ProductSearchResult => result !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, 18)
        : [];

    const newsResults: NewsSearchResult[] = query
        ? newsPosts
            .map((post): NewsSearchResult | null => {
                const score = scoreSearchQuery(query, [
                    { value: post.title, weight: 6.4 },
                    { value: post.slug, weight: 5.2 },
                    { value: post.excerpt, weight: 3.3 },
                    { value: post.intro, weight: 2.7 },
                ]);

                if (score === null) return null;

                return {
                    id: post.id,
                    slug: post.slug,
                    title: post.title,
                    excerpt: post.excerpt ?? post.intro ?? '',
                    publishedAt: post.published_at ?? null,
                    score,
                    translationStatus: inferStatusFromContentMetadata(locale, null, post.locale),
                };
            })
            .filter((result): result is NewsSearchResult => result !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, 18)
        : [];

    const totalResults = productResults.length + newsResults.length;
    const searchBackParams = new URLSearchParams();
    if (query) searchBackParams.set('q', query);
    const searchBackPath = searchBackParams.size > 0
        ? `/${locale}/search?${searchBackParams.toString()}`
        : `/${locale}/search`;

    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <SeoAppJsonLd pathname="/search" />
            <BaseHeader />

            <main className="flex-1 pt-32">
                <div className="max-w-[1440px] mx-auto px-6 md:px-12 pb-24">
                    <section className="py-14 md:py-20 text-center relative flex flex-col items-center">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue rounded-full opacity-20 blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

                        <h1 className="text-[clamp(2.4rem,7vw,4.4rem)] font-serif font-black tracking-tight leading-[0.95] text-kode01-noir mb-5">
                            {t('title')}
                        </h1>
                        <p className="text-base md:text-lg font-medium text-kode01-noir/60 max-w-[760px] mx-auto font-sans leading-relaxed mb-8">
                            {t('subtitle')}
                        </p>

                        <form action={`/${locale}/search`} method="get" className="w-full max-w-[760px] relative mt-2">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-kode01-noir/40" size={24} />
                            <input
                                type="text"
                                name="q"
                                defaultValue={query}
                                placeholder={t('placeholder')}
                                className="w-full border-2 border-black/10 rounded-full py-4 pl-16 pr-36 text-lg focus:outline-none focus:border-kode01-pink/50 transition-colors bg-white/70 backdrop-blur-sm text-kode01-noir placeholder:text-kode01-noir/40 shadow-sm"
                            />
                            <button
                                type="submit"
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-[calc(100%-16px)] px-6 bg-kode01-noir text-white font-bold rounded-full text-xs md:text-sm uppercase tracking-widest hover:bg-kode01-pink hover:text-kode01-noir transition-colors"
                            >
                                {t('submit')}
                            </button>
                        </form>
                    </section>

                    {!query ? (
                        <div className="py-24 bg-white/60 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                                <Search size={26} className="text-kode01-pink" />
                            </div>
                            <p className="text-lg text-kode01-noir/60 font-medium max-w-[620px]">
                                {t('empty_prompt')}
                            </p>
                        </div>
                    ) : totalResults === 0 ? (
                        <div className="py-24 bg-white/60 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                                <Zap size={28} className="text-kode01-pink" />
                            </div>
                            <p className="text-xl text-kode01-noir/50 font-medium mb-2">{t('no_results', { query })}</p>
                        </div>
                    ) : (
                        <div className="space-y-14">
                            <p className="text-sm font-bold uppercase tracking-widest text-kode01-noir/45">
                                {t('summary', { count: totalResults })}
                            </p>

                            {PUBLIC_MARKETPLACE_ENABLED && productResults.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <Package size={18} className="text-kode01-noir/50" />
                                        <h2 className="text-2xl font-serif font-black tracking-tight">{t('section_products')}</h2>
                                        <Badge className="rounded-full bg-kode01-noir text-white">{productResults.length}</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {productResults.map((product) => {
                                            const params = new URLSearchParams();
                                            params.set('back', searchBackPath);
                                            const detailHref = `/${locale}/products/${product.slug}?${params.toString()}`;

                                            return (
                                                <Link
                                                    key={product.id}
                                                    href={detailHref}
                                                    className="rounded-[28px] border border-black/10 bg-white p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                                                >
                                                    <p className="text-lg font-black font-serif tracking-tight mb-2 line-clamp-2">{product.title}</p>
                                                    <ApiContentStatusBadge
                                                        status={product.translationStatus}
                                                        locale={locale}
                                                        className="mb-3"
                                                    />
                                                    {product.description && (
                                                        <p className="text-sm text-kode01-noir/60 line-clamp-3 mb-4">{product.description}</p>
                                                    )}
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        {product.category && (
                                                            <Badge variant="secondary" className="rounded-full bg-kode01-pink/10 text-kode01-pink">
                                                                {product.category}
                                                            </Badge>
                                                        )}
                                                        {product.tags.slice(0, 2).map((tag) => (
                                                            <Badge key={tag} variant="outline" className="rounded-full border-black/20">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-kode01-noir">{formatPrice(product.price, locale)}</span>
                                                        <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                                                            {t('view_product')}
                                                        </span>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {newsResults.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <Newspaper size={18} className="text-kode01-noir/50" />
                                        <h2 className="text-2xl font-serif font-black tracking-tight">{t('section_news')}</h2>
                                        <Badge className="rounded-full bg-kode01-noir text-white">{newsResults.length}</Badge>
                                    </div>
                                    <div className="space-y-4">
                                        {newsResults.map((post) => (
                                            <Link
                                                key={post.id}
                                                href={`/${locale}/news/${post.slug}`}
                                                className="block rounded-[24px] border border-black/10 bg-white p-6 hover:shadow-lg transition-all duration-200"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                                                    <p className="text-xl font-black font-serif tracking-tight line-clamp-2">{post.title}</p>
                                                    <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45 whitespace-nowrap">
                                                        {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ''}
                                                    </span>
                                                </div>
                                                <ApiContentStatusBadge
                                                    status={post.translationStatus}
                                                    locale={locale}
                                                    className="mb-3"
                                                />
                                                {post.excerpt && (
                                                    <p className="text-sm text-kode01-noir/65 line-clamp-3">{post.excerpt}</p>
                                                )}
                                                <div className="mt-4 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                                                    {t('view_news')}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}
                </div>
            </main>

            <BaseFooter />
        </div>
    );
}
