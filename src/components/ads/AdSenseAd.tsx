"use client";

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  hasMarketingConsentInBrowser,
} from '@/features/cookies/lib/consent';

interface AdSenseAdProps {
  adSlot: string;
  locale: string;
  adFormat?: string;
  enableInternalProductFallback?: boolean;
}

type AdsByGoogleCommand = Record<string, unknown>;
type AdsByGoogleQueue = AdsByGoogleCommand[];

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogleQueue;
  }
}

type InternalAdProduct = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  sellerName: string;
  price: number;
};

async function ensureAdSenseScript(clientId: string): Promise<boolean> {
  const existingScript = document.getElementById('adsense-id');
  if (existingScript) return true;

  return new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.id = 'adsense-id';
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export function AdSenseAd({
  adSlot,
  locale,
  adFormat = 'auto',
  enableInternalProductFallback = true,
}: AdSenseAdProps) {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasMarketingConsent, setHasMarketingConsent] = useState<boolean>(() =>
    hasMarketingConsentInBrowser(),
  );
  const [internalAds, setInternalAds] = useState<InternalAdProduct[]>([]);
  const [hasFetchedInternalAds, setHasFetchedInternalAds] = useState(false);

  const shouldShowAdSense = Boolean(clientId) && hasMarketingConsent;
  const isFr = locale === 'fr';

  useEffect(() => {
    const listener = () => {
      setHasMarketingConsent(hasMarketingConsentInBrowser());
    };

    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
    };
  }, []);

  useEffect(() => {
    if (!shouldShowAdSense || !clientId) return;

    let cancelled = false;

    const setupAd = async () => {
      const scriptReady = await ensureAdSenseScript(clientId);
      if (!scriptReady || cancelled) return;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        console.error('AdSense error', err);
      }
    };

    void setupAd();

    return () => {
      cancelled = true;
    };
  }, [clientId, adSlot, shouldShowAdSense]);

  useEffect(() => {
    if (shouldShowAdSense || !enableInternalProductFallback) {
      if (!enableInternalProductFallback) {
        setHasFetchedInternalAds(false);
        setInternalAds([]);
      }
      return;
    }

    let cancelled = false;
    setHasFetchedInternalAds(false);
    setInternalAds([]);

    const fetchInternalAds = async () => {
      try {
        const response = await fetch('/api/ads/internal-products?limit=3', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) return;
        const rows = Array.isArray(payload?.data) ? (payload.data as InternalAdProduct[]) : [];
        setInternalAds(rows);
      } catch (error) {
        console.error('Failed to fetch internal ads:', error);
      } finally {
        if (!cancelled) setHasFetchedInternalAds(true);
      }
    };

    void fetchInternalAds();

    return () => {
      cancelled = true;
    };
  }, [enableInternalProductFallback, shouldShowAdSense]);

  if (!shouldShowAdSense) {
    if (!enableInternalProductFallback) {
      return null;
    }

    if (!hasFetchedInternalAds || internalAds.length === 0) {
      return null;
    }

    return (
      <div className="w-full overflow-hidden rounded-2xl border border-black/5 bg-kode01-cream/30 p-4 transition-all hover:shadow-sm sm:rounded-[32px] sm:p-5 md:p-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center md:mb-8">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-[1px] w-8 bg-kode01-blue/40" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-kode01-blue">
                {isFr ? 'Promo marketplace' : 'Marketplace promo'}
              </p>
            </div>
            <h3 className="font-serif text-xl font-black tracking-tight text-kode01-noir md:text-2xl">
              {isFr ? 'Produits à acheter maintenant' : 'Products you can buy now'}
            </h3>
          </div>
          <Link
            href="/market"
            className="group/btn inline-flex items-center gap-2 rounded-full border border-kode01-noir/5 bg-white px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-kode01-noir shadow-sm transition-all duration-300 hover:bg-kode01-noir hover:text-white active:scale-95"
          >
            {isFr ? 'Explorer' : 'Explore'}
            <ChevronRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
          {internalAds.map((product) => {
            const currentPath = pathname ?? `/${locale}/market`;
            const currentSearch = searchParams?.toString() ?? '';
            const backPath = currentSearch ? `${currentPath}?${currentSearch}` : currentPath;
            const params = new URLSearchParams();
            params.set('back', backPath);
            const detailHref = `/products/${product.slug}?${params.toString()}`;

            return (
              <Link
                key={product.id}
                href={detailHref}
                className="group relative flex flex-col rounded-2xl border border-black/5 bg-white p-3 no-underline transition-all duration-500 hover:-translate-y-1 hover:border-kode01-pink/20 hover:shadow-xl"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-kode01-cream">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                    style={{
                      backgroundImage: product.coverImageUrl ? `url(${product.coverImageUrl})` : 'none',
                    }}
                  />
                  <div className="absolute inset-0 bg-kode01-noir/0 transition-colors duration-500 group-hover:bg-kode01-noir/5" />
                </div>
                <div className="mt-4 flex flex-1 flex-col px-1 pb-1">
                  <p className="line-clamp-1 font-serif text-sm font-bold text-kode01-noir transition-colors group-hover:text-kode01-pink">
                    {product.title}
                  </p>
                  <p className="mt-1.5 h-8 line-clamp-2 text-xs leading-relaxed text-kode01-noir/60">
                    {product.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-kode01-blue">
                      {product.sellerName}
                    </span>
                    <span className="text-sm font-black text-kode01-noir">${product.price}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center overflow-hidden bg-neutral-50 py-4">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client={clientId}
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  );
}
