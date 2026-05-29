'use client';

import { useTranslations } from 'next-intl';
import { Search, ShieldCheck, Download, UserPlus, Upload, Wallet, LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { FaqItem } from '@/features/faq/faq-model';

const StepCard = ({ number, icon: Icon, title, description }: { number: number; icon: LucideIcon; title: string; description: string }) => (
  <div className="p-8 bg-white rounded-3xl border border-kode01-noir/5 shadow-sm hover:shadow-md transition-shadow relative">
    <div className="flex items-center gap-4 mb-6">
      <div className="w-10 h-10 bg-kode01-pink/10 rounded-full flex items-center justify-center text-kode01-pink font-black text-sm">
        {number}
      </div>
      <div className="w-12 h-12 bg-kode01-pink/10 rounded-2xl flex items-center justify-center text-kode01-pink">
        <Icon size={24} />
      </div>
    </div>
    <h3 className="text-xl font-serif font-black text-kode01-noir mb-3">{title}</h3>
    <p className="text-kode01-noir/60 leading-relaxed">{description}</p>
  </div>
);

const SellerStepCard = ({ number, icon: Icon, title, description }: { number: number; icon: LucideIcon; title: string; description: string }) => (
  <div className="p-8 bg-white/5 rounded-3xl border border-white/10 hover:bg-white/10 transition-colors relative">
    <div className="flex items-center gap-4 mb-6">
      <div className="w-10 h-10 bg-kode01-pink/20 rounded-full flex items-center justify-center text-kode01-pink font-black text-sm">
        {number}
      </div>
      <div className="w-12 h-12 bg-kode01-pink/20 rounded-2xl flex items-center justify-center text-kode01-pink">
        <Icon size={24} />
      </div>
    </div>
    <h3 className="text-xl font-serif font-black text-white mb-3">{title}</h3>
    <p className="text-white/60 leading-relaxed">{description}</p>
  </div>
);

export const HowItWorksHero = () => {
  const t = useTranslations('how_it_works.hero');
  return (
    <section className="text-center mb-24">
      <h1 className="text-[clamp(3.5rem,10vw,6rem)] font-serif font-black text-kode01-noir mb-8 tracking-tight leading-[0.9] max-w-5xl mx-auto">
        {t('title')}
      </h1>
      <p className="text-xl md:text-2xl text-kode01-noir/60 max-w-2xl mx-auto leading-relaxed">
        {t('subtitle')}
      </p>
    </section>
  );
};

export const BuyerSteps = () => {
  const t = useTranslations('how_it_works.buyers');
  const steps = [
    { icon: Search, key: 'step1' as const },
    { icon: ShieldCheck, key: 'step2' as const },
    { icon: Download, key: 'step3' as const },
  ];

  return (
    <section className="mb-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-serif font-black text-kode01-noir mb-4">{t('title')}</h2>
        <p className="text-lg text-kode01-noir/60 max-w-xl mx-auto">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step, index) => (
          <StepCard
            key={step.key}
            number={index + 1}
            icon={step.icon}
            title={t(`${step.key}.title`)}
            description={t(`${step.key}.description`)}
          />
        ))}
      </div>
    </section>
  );
};

export const SellerSteps = () => {
  const t = useTranslations('how_it_works.sellers');
  const steps = [
    { icon: UserPlus, key: 'step1' as const },
    { icon: Upload, key: 'step2' as const },
    { icon: Wallet, key: 'step3' as const },
  ];

  return (
    <section className="bg-kode01-noir rounded-[40px] p-10 md:p-20 mb-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-serif font-black text-white mb-4">{t('title')}</h2>
        <p className="text-lg text-white/60 max-w-xl mx-auto">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step, index) => (
          <SellerStepCard
            key={step.key}
            number={index + 1}
            icon={step.icon}
            title={t(`${step.key}.title`)}
            description={t(`${step.key}.description`)}
          />
        ))}
      </div>
    </section>
  );
};

export const HowItWorksFaq = ({ heading, items }: { heading: string; items: readonly FaqItem[] }) => {
  return (
    <article className="bg-white rounded-[32px] p-8 md:p-16 shadow-sm border border-kode01-noir/5 mb-12">
      <h2 className="text-2xl md:text-3xl font-serif font-black text-kode01-noir mb-12 tracking-tight">
        {heading}
      </h2>
      <div className="space-y-10">
        {items.map((item, index) => (
          <section key={item.question} id={`faq-${index + 1}`}>
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
            {index < items.length - 1 && (
              <div className="mt-10 border-t border-kode01-noir/5" />
            )}
          </section>
        ))}
      </div>
    </article>
  );
};

export const HowItWorksCta = () => {
  const t = useTranslations('how_it_works.cta');
  return (
    <div className="bg-kode01-pink/10 rounded-2xl border border-kode01-pink/20 p-8 text-center">
      <h3 className="text-xl font-bold text-kode01-noir mb-2">
        {t('title')}
      </h3>
      <p className="text-kode01-noir/60 mb-6">{t('text')}</p>
      <Link
        href="/news"
        className="inline-block bg-kode01-pink text-kode01-noir font-black uppercase tracking-widest px-8 py-4 hover:bg-kode01-noir hover:text-white transition-colors no-underline"
      >
        {t('button')}
      </Link>
    </div>
  );
};
