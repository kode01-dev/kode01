import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { getAppBaseUrl } from '@/lib/env/server';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { faqItemsToSchema, type FaqItem } from '@/features/faq/faq-model';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cli_faq' });
  const baseUrl = getAppBaseUrl();

  const title = t('meta_title');
  const description = t('meta_description');

  return applySeoMetadata({
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/${locale}/cli-faq`,
      languages: {
        en: `${baseUrl}/en/cli-faq`,
        fr: `${baseUrl}/fr/cli-faq`,
      },
    },
    openGraph: {
      title: t('og_title'),
      description: t('og_description'),
      type: 'website',
      siteName: 'KODE01',
      url: `${baseUrl}/${locale}/cli-faq`,
    },
    twitter: {
      card: 'summary',
      title: t('og_title'),
      description: t('og_description'),
    },
  }, '/cli-faq', { locale });
}

export default async function CliFaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cli_faq' });

  const faqLinksByKey: Partial<Record<(typeof FAQ_KEYS)[number], FaqItem['links']>> = {
    q3: [{ href: '/market', label: t('links.market') }],
    q10: [{ href: '/market', label: t('links.ai_tools') }],
  };

  const faqItems: FaqItem[] = FAQ_KEYS.map((key) => ({
    question: t(`${key}.question`),
    answer: t(`${key}.answer`),
    links: faqLinksByKey[key],
  }));

  const jsonLd = faqItemsToSchema(faqItems);

  return (
    <div className="min-h-screen bg-kode01-cream flex flex-col">
      <SeoAppJsonLd pathname="/cli-faq" fallbackData={jsonLd} schemaOverrideMode="prefer-fallback" />
      <BaseHeader />
      <main className="flex-1 pt-48 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          {/* Hero intro */}
          <h1 className="text-[clamp(3rem,8vw,5rem)] font-serif font-black text-kode01-noir mb-6 tracking-tight leading-none">
            {t('title')}
          </h1>
          <p className="text-kode01-noir/60 text-lg leading-relaxed max-w-2xl mb-16">
            {t('intro')}
          </p>

          {/* FAQ section */}
          <article className="bg-white rounded-[32px] p-8 md:p-16 shadow-sm border border-kode01-noir/5">
            <h2 className="text-2xl md:text-3xl font-serif font-black text-kode01-noir mb-12 tracking-tight">
              {t('faq_heading')}
            </h2>

            <div className="space-y-10">
              {faqItems.map((item, index) => (
                <section key={index} id={`faq-${index + 1}`}>
                  <h3 className="text-xl md:text-2xl font-serif font-black text-kode01-noir mb-4">
                    {item.question}
                  </h3>
                  <p className="text-kode01-noir/60 text-lg leading-relaxed">
                    {item.answer}
                    {item.links?.map((link) => (
                      <span key={link.href}>
                        {' '}
                        <Link href={link.href} className="font-bold text-kode01-noir underline decoration-kode01-pink/60 underline-offset-4 hover:text-kode01-pink">
                          {link.label}
                        </Link>
                      </span>
                    ))}
                  </p>
                  {index < faqItems.length - 1 && (
                    <div className="mt-10 border-t border-kode01-noir/5" />
                  )}
                </section>
              ))}
            </div>
          </article>

          {/* CTA */}
          <div className="mt-12 bg-kode01-pink/10 rounded-2xl border border-kode01-pink/20 p-8 text-center">
            <h3 className="text-xl font-bold text-kode01-noir mb-2">
              {t('cta_title')}
            </h3>
            <p className="text-kode01-noir/60 mb-6">{t('cta_text')}</p>
            <Link
              href="/market"
              className="inline-block bg-kode01-pink text-kode01-noir font-black uppercase tracking-widest px-8 py-4 hover:bg-kode01-noir hover:text-white transition-colors no-underline"
            >
              {t('cta_button')}
            </Link>
          </div>
        </div>
      </main>
      <BaseFooter />
    </div>
  );
}
