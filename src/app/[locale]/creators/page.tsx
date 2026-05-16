import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CreatorsPage } from '@/features/creators/pages/CreatorsPage';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.creators' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/creators', { locale });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    return (
        <>
            <SeoAppJsonLd pathname="/creators" />
            <CreatorsPage locale={locale} />
        </>
    );
}
