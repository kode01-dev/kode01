import { Metadata } from 'next';
import dynamic from 'next/dynamic';
import HomePageClient from './HomePageClient';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { getDefaultSections } from '@/features/homepage-layout/utils';
import {
    getHomeStatsServer,
    getHomeProductsServer,
    getTopDealsServer,
    type HomeStatsData,
} from '@/features/homepage/lib/homepage-data-server';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';
import { CANONICAL_SITE_URL, applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

const BaseFooter = dynamic(() => import('@/components/layout/BaseFooter').then((mod) => mod.BaseFooter), {
    ssr: true,
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return applySeoMetadata({
        title: 'KODE01',
        description: 'KODE01',
    }, '/', { locale });
}

const EMPTY_HOME_STATS: HomeStatsData = {
    productsAndArticles: 0,
    creators: 0,
    totalSales: 0,
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const sections = getDefaultSections().filter(
        (section) =>
            PUBLIC_MARKETPLACE_ENABLED
            || (section.type !== 'products_latest' && section.type !== 'top_deals'),
    );

    // Preload critical homepage data to avoid client-side layout popping while scrolling.
    // Use a soft-fail strategy so one backend/env issue does not crash Server Components render.
    const [statsResult, productsResult, topDealsResult] = await Promise.allSettled([
        getHomeStatsServer(),
        PUBLIC_MARKETPLACE_ENABLED ? getHomeProductsServer(4) : Promise.resolve([]),
        PUBLIC_MARKETPLACE_ENABLED ? getTopDealsServer(6) : Promise.resolve([]),
    ]);

    if (statsResult.status === 'rejected') {
        console.error('Homepage stats preload failed:', statsResult.reason);
    }
    if (PUBLIC_MARKETPLACE_ENABLED && productsResult.status === 'rejected') {
        console.error('Homepage products preload failed:', productsResult.reason);
    }
    if (PUBLIC_MARKETPLACE_ENABLED && topDealsResult.status === 'rejected') {
        console.error('Homepage top deals preload failed:', topDealsResult.reason);
    }

    const initialStats = statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_HOME_STATS;
    const initialProducts = PUBLIC_MARKETPLACE_ENABLED && productsResult.status === 'fulfilled' ? productsResult.value : [];
    const initialTopDeals = PUBLIC_MARKETPLACE_ENABLED && topDealsResult.status === 'fulfilled' ? topDealsResult.value : [];
    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'KODE01',
            url: CANONICAL_SITE_URL,
            logo: `${CANONICAL_SITE_URL}/logo_v2.png`,
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'KODE01',
            url: `${CANONICAL_SITE_URL}/${locale}`,
            inLanguage: locale,
            potentialAction: {
                '@type': 'SearchAction',
                target: `${CANONICAL_SITE_URL}/${locale}/search?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
            },
        },
    ];

    return (
        <>
            <SeoAppJsonLd pathname="/" fallbackData={jsonLd} />
            <HomePageClient
                sections={sections}
                initialData={{
                    stats: initialStats,
                    products: initialProducts,
                    topDeals: initialTopDeals,
                }}
                header={<BaseHeader key="home-header" hideSearchOnTop={true} />}
                footer={<BaseFooter key="home-footer" />}
            />
        </>
    );
}
