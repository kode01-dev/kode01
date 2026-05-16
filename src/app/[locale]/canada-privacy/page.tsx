import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import CanadaPrivacyContent from './CanadaPrivacyContent';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.canada_privacy' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/canada-privacy', { locale });
}

export default function Page() {
    return (
        <>
            <SeoAppJsonLd pathname="/canada-privacy" />
            <CanadaPrivacyContent />
        </>
    );
}
