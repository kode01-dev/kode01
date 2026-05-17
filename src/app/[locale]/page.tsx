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
import { CANONICAL_SITE_URL, applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

const BaseFooter = dynamic(() => import('@/components/layout/BaseFooter').then((mod) => mod.BaseFooter), {
    ssr: true,
});

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    return applySeoMetadata({
        title: 'KODE01',
        description: locale === 'fr'
            ? 'KODE01 rassemble veille IA, outils, ressources et produits numériques pour aider les builders et créateurs à suivre les nouveautés et passer plus vite à l’action.'
            : 'KODE01 brings together AI updates, tools, resources, and digital products so builders and creators can follow what is new and move faster.',
    }, '/', { locale });
}

const EMPTY_HOME_STATS: HomeStatsData = {
    productsAndArticles: 0,
    creators: 0,
    totalSales: 0,
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const sections = getDefaultSections();

    // Preload critical homepage data to avoid client-side layout popping while scrolling.
    // Use a soft-fail strategy so one backend/env issue does not crash Server Components render.
    const [statsResult, productsResult, topDealsResult] = await Promise.allSettled([
        getHomeStatsServer(),
        getHomeProductsServer(4),
        getTopDealsServer(6),
    ]);

    if (statsResult.status === 'rejected') {
        console.error('Homepage stats preload failed:', statsResult.reason);
    }
    if (productsResult.status === 'rejected') {
        console.error('Homepage products preload failed:', productsResult.reason);
    }
    if (topDealsResult.status === 'rejected') {
        console.error('Homepage top deals preload failed:', topDealsResult.reason);
    }

    const initialStats = statsResult.status === 'fulfilled' ? statsResult.value : EMPTY_HOME_STATS;
    const initialProducts = productsResult.status === 'fulfilled' ? productsResult.value : [];
    const initialTopDeals = topDealsResult.status === 'fulfilled' ? topDealsResult.value : [];
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
