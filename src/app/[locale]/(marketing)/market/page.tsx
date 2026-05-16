import { MarketPage } from '@/features/market/pages/MarketPage';
import { getMarketListDataCached } from '@/features/market/server/list-repository';
import { getTranslations } from 'next-intl/server';
import { Metadata } from 'next';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'market' });
    return applySeoMetadata({
        title: t('meta_title'),
        description: t('meta_description'),
    }, '/market', { locale });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'market' });
    const initialData = await getMarketListDataCached({
        locale,
        limit: 24,
        offset: 0,
        search: '',
        category: '',
        subcategories: '',
        tags: '',
        sort: 'newest',
        type: 'all',
        includeFacets: true,
        includeTotal: true,
    });
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: t('meta_title'),
        description: t('meta_description'),
        url: `https://kode01.com/${locale}/market`,
        inLanguage: locale,
    };

    return (
        <>
            <SeoAppJsonLd pathname="/market" fallbackData={jsonLd} />
            <MarketPage initialData={initialData} />
        </>
    );
}
