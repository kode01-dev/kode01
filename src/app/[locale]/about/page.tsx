import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { 
    AboutHero, 
    AboutMission, 
    AboutValues, 
    AboutAudience, 
    AboutCta 
} from '@/features/about/components/AboutComponents';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.about' });
    const baseUrl = 'https://kode01.com';
    
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
        alternates: {
            canonical: `${baseUrl}/${locale}/about`,
            languages: {
                en: `${baseUrl}/en/about`,
                fr: `${baseUrl}/fr/about`,
            },
        },
        openGraph: {
            title: t('title'),
            description: t('description'),
            url: `${baseUrl}/${locale}/about`,
            siteName: 'KODE01',
            locale: locale === 'fr' ? 'fr_CA' : 'en_CA',
            type: 'website',
        },
    }, '/about', { locale });
}

export default async function AboutPage() {
    const tBus = await getTranslations('seo.business');
    
    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": tBus('name'),
        "url": tBus('url'),
        "logo": `${tBus('url')}/favicon.png`,
        "description": tBus('description'),
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Gatineau/Ottawa",
            "addressRegion": tBus('region'),
            "addressCountry": "Canada"
        }
    };

    const localBusinessSchema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": tBus('name'),
        "description": tBus('description'),
        "url": `${tBus('url')}/about`,
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Gatineau/Ottawa",
            "addressRegion": tBus('region'),
            "addressCountry": "Canada"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "45.4215",
            "longitude": "-75.6972"
        },
        "areaServed": [
            { "@type": "City", "name": "Gatineau" },
            { "@type": "City", "name": "Ottawa" },
            { "@type": "State", "name": "Quebec" },
            { "@type": "State", "name": "Ontario" }
        ]
    };
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [organizationSchema, localBusinessSchema],
    };

    return (
        <div className="min-h-screen bg-kode01-cream flex flex-col">
            <SeoAppJsonLd pathname="/about" fallbackData={jsonLd} />
            <BaseHeader />
            <main className="flex-1" style={{ paddingTop: 'clamp(140px, 20vw, 240px)', paddingBottom: '80px' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 clamp(20px, 4vw, 48px)' }}>
                    <AboutHero />
                    <AboutMission />
                    <AboutValues />
                    <AboutAudience />
                    <AboutCta />
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}
