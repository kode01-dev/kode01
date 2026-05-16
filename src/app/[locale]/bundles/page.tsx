import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BundlesPage } from '@/features/bundles/pages/BundlesPage';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.bundles' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/bundles', { locale });
}

export default function Page() {
    return (
        <>
            <SeoAppJsonLd pathname="/bundles" />
            <BundlesPage />
        </>
    );
}
