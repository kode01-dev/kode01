'use client';

import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ScrollToTopButton() {
    const t = useTranslations('layout.footer');
    
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <button
            onClick={scrollToTop}
            className="group flex items-center gap-2 px-4 py-2 text-[10px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors"
        >
            {t('back_to_top')}
            <ArrowUp size={14} className="group-hover:-translate-y-1 transition-transform" />
        </button>
    );
}
