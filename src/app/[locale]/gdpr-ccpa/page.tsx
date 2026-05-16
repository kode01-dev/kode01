import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import GdprCcpaContent from './GdprCcpaContent';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.gdpr_ccpa' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/gdpr-ccpa', { locale });
}

export default function Page() {
    return (
        <>
            <SeoAppJsonLd pathname="/gdpr-ccpa" />
            <GdprCcpaContent />
        </>
    );
}
