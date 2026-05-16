import { AdPlacementSlug } from '@/features/ads/types';
import { resolveActiveCreativesForPlacement } from '@/features/ads/server/repository';
import { SponsoredAdCard } from '@/components/ads/SponsoredAdCard';
import { AdSenseAd } from '@/components/ads/AdSenseAd';

type SponsoredPlacementSlotProps = {
  placement: AdPlacementSlug;
  locale?: string;
  pagePath?: string;
  fallbackAdSenseSlot?: string;
  layout?: 'banner' | 'sidebar';
  showPlaceholderWhenEmpty?: boolean;
};

function SponsoredHouseBanner({ locale }: { locale?: string }) {
  const isFr = locale === 'fr';
  const advertiseHref = `/${locale ?? 'en'}/advertise`;

  return (
    <aside className="w-full overflow-hidden rounded-xl border border-kode01-noir/10 bg-gradient-to-r from-kode01-cream to-white shadow-sm">
      <a
        href={advertiseHref}
        className="flex flex-col gap-3 px-3 py-2.5 no-underline sm:flex-row sm:items-center sm:justify-between sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <p className="mb-1 inline-flex items-center rounded-full border border-kode01-noir/15 bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-kode01-noir/60">
            Sponsorise
          </p>
          <h3 className="truncate text-sm font-black text-kode01-noir">
            {isFr ? 'Cet espace est disponible pour votre pub' : 'This slot is available for your ad'}
          </h3>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-kode01-noir px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir">
          {isFr ? 'Devenir sponsor' : 'Become sponsor'}
        </span>
      </a>
    </aside>
  );
}

export async function SponsoredPlacementSlot({
  placement,
  locale,
  pagePath,
  fallbackAdSenseSlot,
  layout,
  showPlaceholderWhenEmpty = false,
}: SponsoredPlacementSlotProps) {
  const maxCreatives = layout === 'sidebar' ? 2 : 1;
  const creatives = await resolveActiveCreativesForPlacement(placement, maxCreatives);

  if (layout === 'sidebar') {
    if (creatives.length >= 2) {
      return (
        <div className="space-y-3">
          <SponsoredAdCard
            creative={creatives[0]}
            placement={placement}
            locale={locale}
            pagePath={pagePath}
            layout="sidebar_split"
          />
          <SponsoredAdCard
            creative={creatives[1]}
            placement={placement}
            locale={locale}
            pagePath={pagePath}
            layout="sidebar_split"
          />
        </div>
      );
    }

    if (creatives.length === 1) {
      return (
        <SponsoredAdCard
          creative={creatives[0]}
          placement={placement}
          locale={locale}
          pagePath={pagePath}
          layout="banner"
        />
      );
    }
  } else if (creatives.length > 0) {
    return (
      <SponsoredAdCard
        creative={creatives[0]}
        placement={placement}
        locale={locale}
        pagePath={pagePath}
        layout={layout}
      />
    );
  }

  if (showPlaceholderWhenEmpty) {
    if (!fallbackAdSenseSlot) {
      return <SponsoredHouseBanner locale={locale} />;
    }

    return (
      <div className="space-y-3">
        <SponsoredHouseBanner locale={locale} />
        <AdSenseAd
          adSlot={fallbackAdSenseSlot}
          locale={locale ?? 'en'}
          enableInternalProductFallback={false}
        />
      </div>
    );
  }

  if (!fallbackAdSenseSlot) {
    return null;
  }

  return <AdSenseAd adSlot={fallbackAdSenseSlot} locale={locale ?? 'en'} />;
}
