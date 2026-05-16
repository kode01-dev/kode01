'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import type { HomepageSectionContent } from '@/features/homepage-layout/types';
import { resolveSafeCtaTarget } from '@/lib/security/safe-cta-navigation';
import { getLocalizedSectionValue } from '../helpers';

interface CtaSectionProps {
    template?: string;
    content?: HomepageSectionContent;
}

export const CtaSection = ({ template = 'banner', content }: CtaSectionProps) => {
    const locale = useLocale();
    const isFrench = locale.startsWith('fr');
    const router = useRouter();
    const title = getLocalizedSectionValue(content, 'title', locale) ?? (isFrench ? 'Pret a vendre vos creations ?' : 'Ready to sell your creations?');
    const subtitle = getLocalizedSectionValue(content, 'subtitle', locale) ?? (isFrench ? 'Publie tes produits digitaux et trouve ta prochaine audience.' : 'Publish digital products and reach your next audience.');
    const ctaLabel = getLocalizedSectionValue(content, 'cta_label', locale) ?? (isFrench ? 'Commencer a vendre' : 'Start selling');
    const ctaHref = content?.cta_href || '/vendor';

    const goToCta = () => {
        const target = resolveSafeCtaTarget(ctaHref);
        if (!target) return;
        if (target.kind === 'external') {
            window.open(target.href, '_blank', 'noopener,noreferrer');
            return;
        }
        router.push(target.href);
    };

    return (
        <section className={template === 'panel' ? 'mb-16 md:mb-24 rounded-[24px] border border-black/10 bg-white p-8 md:p-10' : 'mb-16 md:mb-24 rounded-[32px] bg-[#2B463C] p-8 md:p-12 text-white'}>
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                    <h2 className={template === 'panel' ? 'text-3xl md:text-4xl font-serif font-black text-kode01-noir' : 'text-3xl md:text-4xl font-serif font-black'}>{title}</h2>
                    <p className={template === 'panel' ? 'mt-3 text-kode01-noir/60' : 'mt-3 text-white/80'}>{subtitle}</p>
                </div>
                <Button type="button" className={template === 'panel' ? 'rounded-full bg-kode01-noir text-kode01-white' : 'rounded-full bg-kode01-pink text-kode01-noir'} onClick={goToCta}>{ctaLabel}</Button>
            </div>
        </section>
    );
};