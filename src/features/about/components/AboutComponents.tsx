'use client';

import { useTranslations } from 'next-intl';
import { LucideIcon, Zap, Search, Globe } from 'lucide-react';

const ValueCard = ({ icon: Icon, title, description }: { icon: LucideIcon, title: string, description: string }) => (
  <div className="p-8 bg-white rounded-3xl border border-kode01-noir/5 shadow-sm hover:shadow-md transition-shadow">
    <div className="w-12 h-12 bg-kode01-pink/10 rounded-2xl flex items-center justify-center mb-6 text-kode01-pink">
      <Icon size={24} />
    </div>
    <h3 className="text-xl font-serif font-black text-kode01-noir mb-3">{title}</h3>
    <p className="text-kode01-noir/60 leading-relaxed">{description}</p>
  </div>
);

export const AboutHero = () => {
  const t = useTranslations('about.hero');
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

export const AboutMission = () => {
  const t = useTranslations('about.mission');
  return (
    <section className="bg-white rounded-[40px] p-10 md:p-20 border border-kode01-noir/5 shadow-sm mb-16">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-serif font-black text-kode01-noir mb-8">{t('title')}</h2>
        <p className="text-xl text-kode01-noir/70 leading-relaxed italic">
          &quot;{t('description')}&quot;
        </p>
      </div>
    </section>
  );
};

export const AboutValues = () => {
  const t = useTranslations('about.values');
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
      <ValueCard 
        icon={Zap} 
        title={t('speed.title')} 
        description={t('speed.description')} 
      />
      <ValueCard 
        icon={Search} 
        title={t('curation.title')} 
        description={t('curation.description')} 
      />
      <ValueCard 
        icon={Globe} 
        title={t('innovation.title')} 
        description={t('innovation.description')} 
      />
    </div>
  );
};

export const AboutAudience = () => {
  const t = useTranslations('about.audience');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
      <div className="bg-kode01-noir text-white p-12 rounded-[40px] flex flex-col justify-between h-full hover:scale-[1.02] transition-transform">
        <div>
          <span className="text-kode01-pink font-bold tracking-widest uppercase text-sm mb-4 block">{t('creators.label')}</span>
          <h3 className="text-3xl font-serif font-black mb-6 leading-tight">{t('creators.title')}</h3>
          <p className="text-white/70 text-lg leading-relaxed">{t('creators.description')}</p>
        </div>
      </div>
      <div className="bg-kode01-cream p-12 rounded-[40px] border border-kode01-noir/10 flex flex-col justify-between h-full hover:scale-[1.02] transition-transform">
        <div>
          <span className="text-kode01-noir/40 font-bold tracking-widest uppercase text-sm mb-4 block">{t('builders.label')}</span>
          <h3 className="text-3xl font-serif font-black text-kode01-noir mb-6 leading-tight">{t('builders.title')}</h3>
          <p className="text-kode01-noir/60 text-lg leading-relaxed">{t('builders.description')}</p>
        </div>
      </div>
    </div>
  );
};

export const AboutLocation = () => {
  const t = useTranslations('about.location');
  return (
    <section className="bg-kode01-pink/5 rounded-[40px] p-12 md:p-20 border border-kode01-pink/10 text-center relative overflow-hidden">
      <div className="relative z-10 max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif font-black text-kode01-noir mb-6">{t('title')}</h2>
        <p className="text-lg md:text-xl text-kode01-noir/60 leading-relaxed">
          {t('description')}
        </p>
      </div>
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-kode01-pink/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-kode01-pink/10 rounded-full blur-3xl -ml-32 -mb-32"></div>
    </section>
  );
};
