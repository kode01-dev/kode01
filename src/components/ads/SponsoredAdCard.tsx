import { SponsoredCreative, AdPlacementSlug } from '@/features/ads/types';
import { SponsoredAdImpressionTracker } from '@/components/ads/SponsoredAdImpressionTracker';
import Image from 'next/image';

type SponsoredAdCardProps = {
  creative: SponsoredCreative;
  placement: AdPlacementSlug;
  locale?: string;
  pagePath?: string;
  layout?: 'banner' | 'sidebar' | 'sidebar_split';
};

export function SponsoredAdCard({ creative, placement, locale, pagePath, layout = 'banner' }: SponsoredAdCardProps) {
  const clickUrl = new URLSearchParams({
    campaignId: creative.campaignId,
    creativeId: creative.creativeId,
    placement,
    channel: 'web',
    ...(locale ? { locale } : {}),
  });
  const isExternalDestination = creative.destinationKind === 'external';
  const targetValue = '_blank';
  const relValue = isExternalDestination
    ? 'nofollow sponsored noopener noreferrer'
    : 'noopener noreferrer';

  if (placement === 'news' && layout === 'sidebar_split') {
    return (
      <aside className="w-full rounded-xl border border-kode01-noir/10 bg-white p-2.5 shadow-sm">
        <SponsoredAdImpressionTracker
          campaignId={creative.campaignId}
          creativeId={creative.creativeId}
          placement={placement}
          locale={locale}
          pagePath={pagePath}
        />
        <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.2em] text-kode01-noir/45">Sponsorise</p>
        <a
          href={`/api/ads/click?${clickUrl.toString()}`}
          target={targetValue}
          className="group block no-underline"
          rel={relValue}
        >
          <div className="overflow-hidden rounded-lg border border-black/5 bg-kode01-cream/40">
            <Image
              src={creative.imageUrl}
              alt={creative.title}
              width={1200}
              height={675}
              className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <h3 className="mt-2 line-clamp-2 text-xs font-black leading-tight text-kode01-noir">
            {creative.title}
          </h3>
          <span className="mt-2 inline-flex w-fit items-center rounded-full bg-kode01-noir px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white transition-colors group-hover:bg-kode01-pink group-hover:text-kode01-noir">
            {creative.ctaText}
          </span>
        </a>
      </aside>
    );
  }

  if (placement === 'news' && layout === 'sidebar') {
    return (
      <aside className="w-full rounded-2xl border border-kode01-noir/10 bg-white p-3 shadow-sm">
        <SponsoredAdImpressionTracker
          campaignId={creative.campaignId}
          creativeId={creative.creativeId}
          placement={placement}
          locale={locale}
          pagePath={pagePath}
        />
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-kode01-noir/45">Sponsorise</p>
        <a
          href={`/api/ads/click?${clickUrl.toString()}`}
          target={targetValue}
          className="group block space-y-2 no-underline"
          rel={relValue}
        >
          <div className="aspect-square overflow-hidden rounded-xl border border-black/5 bg-kode01-cream/40">
            <Image
              src={creative.imageUrl}
              alt={creative.title}
              width={700}
              height={700}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
          <div className="aspect-square rounded-xl border border-black/10 bg-gradient-to-br from-kode01-cream to-white p-3">
            <div className="flex h-full flex-col justify-between">
              <h3 className="text-sm font-black leading-tight text-kode01-noir">{creative.title}</h3>
              <span className="inline-flex w-fit items-center rounded-full bg-kode01-noir px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors group-hover:bg-kode01-pink group-hover:text-kode01-noir">
                {creative.ctaText}
              </span>
            </div>
          </div>
        </a>
      </aside>
    );
  }

  if (placement === 'news') {
    return (
      <aside className="w-full overflow-hidden rounded-xl border border-kode01-noir/10 bg-gradient-to-r from-kode01-cream to-white shadow-sm">
        <SponsoredAdImpressionTracker
          campaignId={creative.campaignId}
          creativeId={creative.creativeId}
          placement={placement}
          locale={locale}
          pagePath={pagePath}
        />
        <a
          href={`/api/ads/click?${clickUrl.toString()}`}
          target={targetValue}
          className="flex flex-col gap-3 px-3 py-2.5 no-underline sm:flex-row sm:items-center sm:justify-between sm:px-4"
          rel={relValue}
        >
          <div className="min-w-0 flex-1">
            <p className="mb-1 inline-flex items-center rounded-full border border-kode01-noir/15 bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-kode01-noir/60">
              Sponsorise
            </p>
            <h3 className="truncate text-sm font-black text-kode01-noir">{creative.title}</h3>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-kode01-noir px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir">
            {creative.ctaText}
          </span>
        </a>
      </aside>
    );
  }

  return (
    <aside className="w-full rounded-3xl border border-black/10 bg-white p-4 sm:p-5 shadow-sm">
      <SponsoredAdImpressionTracker
        campaignId={creative.campaignId}
        creativeId={creative.creativeId}
        placement={placement}
        locale={locale}
        pagePath={pagePath}
      />
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/45">Sponsorise</p>
      <a
        href={`/api/ads/click?${clickUrl.toString()}`}
        target={targetValue}
        className="group no-underline"
        rel={relValue}
      >
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-kode01-cream/40">
          <Image
            src={creative.imageUrl}
            alt={creative.title}
            width={1200}
            height={628}
            className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <h3 className="mt-3 text-base font-bold text-kode01-noir">{creative.title}</h3>
        <span className="mt-2 inline-flex items-center rounded-full bg-kode01-noir px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white group-hover:bg-kode01-pink group-hover:text-kode01-noir">
          {creative.ctaText}
        </span>
      </a>
    </aside>
  );
}
