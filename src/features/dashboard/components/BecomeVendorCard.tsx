'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VendorApplicationModal } from './VendorApplicationModal';

export function BecomeVendorCard() {
  const t = useTranslations('dashboard.buyer.become_vendor');
  const [isOpen, setIsOpen] = useState(false);

  // Listen for the welcome modal's "activate seller mode" signal
  useEffect(() => {
    function handleOpenVendorApplication() {
      setIsOpen(true);
    }

    window.addEventListener('kode01:open-vendor-application', handleOpenVendorApplication);
    return () => {
      window.removeEventListener('kode01:open-vendor-application', handleOpenVendorApplication);
    };
  }, []);

  return (
    <>
      <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-pink/20 bg-gradient-to-r from-kode01-pink/10 via-kode01-white to-kode01-blue/10 shadow-sm">
        <CardContent className="relative px-6 py-7 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute right-[-48px] top-[-42px] h-36 w-36 rounded-full bg-kode01-pink/20 blur-2xl" />
          <div className="pointer-events-none absolute left-[-30px] bottom-[-50px] h-28 w-28 rounded-full bg-kode01-blue/20 blur-2xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-kode01-pink/30 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                <Sparkles size={12} className="text-kode01-pink" />
                {t('eyebrow')}
              </p>
              <h2 className="mt-3 font-serif text-2xl font-black text-kode01-noir sm:text-3xl">{t('title')}</h2>
              <p className="mt-2 max-w-xl text-sm text-kode01-noir/65 sm:text-base">{t('description')}</p>
            </div>

            <Button
              type="button"
              onClick={() => setIsOpen(true)}
              className="rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold px-6 h-11 shadow-sm"
            >
              {t('cta')}
              <ArrowRight size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <VendorApplicationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

