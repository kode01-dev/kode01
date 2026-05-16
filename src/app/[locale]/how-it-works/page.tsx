import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { getAppBaseUrl } from '@/lib/env/server';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import {
  HowItWorksHero,
  BuyerSteps,
  SellerSteps,
  HowItWorksFaq,
  HowItWorksCta,
} from '@/features/how-it-works/components/HowItWorksComponents';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'how_it_works' });
  const baseUrl = getAppBaseUrl();

  return applySeoMetadata({
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: {
      canonical: `${baseUrl}/${locale}/how-it-works`,
      languages: {
        en: `${baseUrl}/en/how-it-works`,
        fr: `${baseUrl}/fr/how-it-works`,
      },
    },
    openGraph: {
      title: t('og_title'),
      description: t('og_description'),
      type: 'website',
      siteName: 'KODE01',
      url: `${baseUrl}/${locale}/how-it-works`,
      locale: locale === 'fr' ? 'fr_CA' : 'en_CA',
    },
    twitter: {
      card: 'summary',
      title: t('og_title'),
      description: t('og_description'),
    },
  }, '/how-it-works', { locale });
}

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'how_it_works' });
  const baseUrl = getAppBaseUrl();

  const faqItems = FAQ_KEYS.map((key) => ({
    question: t(`faq.${key}.question`),
    answer: t(`faq.${key}.answer`),
  }));

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: t('hero.title'),
    description: t('hero.subtitle'),
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: t('buyers.step1.title'),
        text: t('buyers.step1.description'),
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: t('buyers.step2.title'),
        text: t('buyers.step2.description'),
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: t('buyers.step3.title'),
        text: t('buyers.step3.description'),
      },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'KODE01',
        item: `${baseUrl}/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('hero.title'),
        item: `${baseUrl}/${locale}/how-it-works`,
      },
    ],
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [howToSchema, faqSchema, breadcrumbSchema],
  };

  return (
    <div className="min-h-screen bg-kode01-cream flex flex-col">
      <SeoAppJsonLd pathname="/how-it-works" fallbackData={jsonLd} />
      <BaseHeader />
      <main className="flex-1 pt-48 pb-32">
        <div className="max-w-6xl mx-auto px-6">
          <HowItWorksHero />
          <BuyerSteps />
          <SellerSteps />
          <HowItWorksFaq />
          <HowItWorksCta />
        </div>
      </main>
      <BaseFooter />
    </div>
  );
}
