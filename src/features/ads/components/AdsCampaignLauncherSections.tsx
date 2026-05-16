'use client';

import { ChangeEvent } from 'react';
import { Check, Loader2, Megaphone, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ACCEPTED_FILE_FORMAT_LABEL,
  FILE_INPUT_ACCEPT,
  MAX_FILE_SIZE_MB,
  formatMoney,
} from './adsCampaignLauncher.utils';
import type {
  CampaignDestinationKind,
  CampaignNewsFormat,
  LauncherStep,
  PlacementAssetState,
  PlacementMultipliers,
  PlacementSlug,
  PricingPlanOption,
} from './adsCampaignLauncher.types';

type LauncherDialogHeaderProps = {
  guideHref: string;
};

export function LauncherDialogHeader({ guideHref }: LauncherDialogHeaderProps) {
  const t = useTranslations('dashboard.buyer.ads');

  return (
    <div className="shrink-0 border-b border-black/5 bg-gradient-to-r from-kode01-pink/10 via-white to-kode01-blue/10 px-6 py-5 pr-12 sm:px-8">
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl font-black text-kode01-noir">
          {t('launcher.title')}
        </DialogTitle>
        <DialogDescription className="text-kode01-noir/60">
          {t('launcher.subtitle')}
        </DialogDescription>
      </DialogHeader>
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-kode01-noir/60">
        {t('launcher.review_notice')}
      </p>
      <div className="mt-3">
        <a
          href={guideHref}
          className="text-xs font-bold uppercase tracking-widest text-kode01-noir/70 transition-colors hover:text-kode01-noir"
        >
          {t('guide_button')}
        </a>
      </div>
    </div>
  );
}

type LauncherStepIndicatorProps = {
  step: LauncherStep;
};

export function LauncherStepIndicator({ step }: LauncherStepIndicatorProps) {
  const t = useTranslations('dashboard.buyer.ads');

  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
      <span className={cn(step === 'offers' ? 'text-kode01-noir' : 'text-kode01-noir/35')}>
        1. {t('launcher.steps.offers')}
      </span>
      <span className="text-kode01-noir/20">/</span>
      <span className={cn(step === 'details' ? 'text-kode01-noir' : 'text-kode01-noir/35')}>
        2. {t('launcher.steps.details')}
      </span>
    </div>
  );
}

type OffersStepSectionProps = {
  plans: PricingPlanOption[];
  selectedPlanId: string;
  selectedPlan: PricingPlanOption | null;
  newsFormat: CampaignNewsFormat | null;
  includeNewsletter: boolean;
  multipliers: PlacementMultipliers;
  locale: string;
  displayCurrency: string;
  totalPrice: number;
  onSelectPlan: (planId: string) => void;
  onToggleNewsFormat: (format: CampaignNewsFormat) => void;
  onToggleNewsletter: () => void;
};

export function OffersStepSection({
  plans,
  selectedPlanId,
  selectedPlan,
  newsFormat,
  includeNewsletter,
  multipliers,
  locale,
  displayCurrency,
  totalPrice,
  onSelectPlan,
  onToggleNewsFormat,
  onToggleNewsletter,
}: OffersStepSectionProps) {
  const t = useTranslations('dashboard.buyer.ads');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
          {t('launcher.plan_label')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlan(plan.id)}
              className={cn(
                'rounded-2xl border px-4 py-3 text-left transition-all',
                selectedPlanId === plan.id
                  ? 'border-kode01-noir bg-kode01-noir text-kode01-white'
                  : 'border-black/10 bg-white hover:border-black/25',
              )}
            >
              <div className="text-sm font-black">{plan.name || `${plan.durationDays} ${t('launcher.days')}`}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-kode01-noir/60">{t('launcher.plan_hint')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
          {t('launcher.news_offer_label')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onToggleNewsFormat('split')}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left transition-all',
              newsFormat === 'split'
                ? 'border-kode01-blue bg-kode01-blue/10'
                : 'border-black/10 bg-white hover:border-black/25',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-kode01-noir">{t('launcher.offers.split.title')}</span>
              {newsFormat === 'split' ? <Check size={16} className="text-kode01-blue" /> : null}
            </div>
            <p className="mt-1 text-xs text-kode01-noir/60">{t('launcher.offers.split.description')}</p>
            {selectedPlan ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                {formatMoney(selectedPlan.basePrice * multipliers.news * 0.5, locale, displayCurrency)}
              </p>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => onToggleNewsFormat('full')}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left transition-all',
              newsFormat === 'full'
                ? 'border-kode01-pink bg-kode01-pink/10'
                : 'border-black/10 bg-white hover:border-black/25',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-kode01-noir">{t('launcher.offers.full.title')}</span>
              {newsFormat === 'full' ? <Check size={16} className="text-kode01-pink" /> : null}
            </div>
            <p className="mt-1 text-xs text-kode01-noir/60">{t('launcher.offers.full.description')}</p>
            {selectedPlan ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                {formatMoney(selectedPlan.basePrice * multipliers.news, locale, displayCurrency)}
              </p>
            ) : null}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleNewsletter}
        className={cn(
          'w-full rounded-2xl border px-4 py-3 text-left transition-all',
          includeNewsletter
            ? 'border-kode01-green bg-kode01-green/10'
            : 'border-black/10 bg-white hover:border-black/25',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-black text-kode01-noir">{t('launcher.offers.newsletter.title')}</span>
          {includeNewsletter ? <Check size={16} className="text-kode01-green" /> : null}
        </div>
        <p className="mt-1 text-xs text-kode01-noir/60">{t('launcher.offers.newsletter.description')}</p>
        {selectedPlan ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
            {formatMoney(selectedPlan.basePrice * multipliers.newsletterFooter, locale, displayCurrency)}
          </p>
        ) : null}
      </button>

      <div className="rounded-2xl border border-black/10 bg-kode01-cream/45 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
          {t('launcher.total_label')}
        </p>
        <p className="mt-1 text-2xl font-black text-kode01-noir">
          {formatMoney(totalPrice, locale, displayCurrency)}
        </p>
        <p className="mt-2 text-xs text-kode01-noir/55">
          {t('launcher.plan_hint')}
        </p>
      </div>
    </div>
  );
}

type PlacementAssetCardProps = {
  placementSlug: PlacementSlug;
  placementAsset: PlacementAssetState;
  pagesValue: string;
  isSubmitting: boolean;
  isUploadingThisPlacement: boolean;
  getPlacementLabel: (placementSlug: PlacementSlug) => string;
  getPlacementPreferredSize: (placementSlug: PlacementSlug) => { width: number; height: number };
  onPlacementFileChange: (placementSlug: PlacementSlug, event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onPlacementPagesChange: (placementSlug: PlacementSlug, value: string) => void;
};

function PlacementAssetCard({
  placementSlug,
  placementAsset,
  pagesValue,
  isSubmitting,
  isUploadingThisPlacement,
  getPlacementLabel,
  getPlacementPreferredSize,
  onPlacementFileChange,
  onPlacementPagesChange,
}: PlacementAssetCardProps) {
  const t = useTranslations('dashboard.buyer.ads');
  const preferredSize = getPlacementPreferredSize(placementSlug);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-kode01-noir">
          {getPlacementLabel(placementSlug)}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-kode01-cream px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
          <Megaphone size={12} />
          {placementSlug === 'news' ? t('launcher.form.slot_news') : t('launcher.form.slot_newsletter')}
        </span>
      </div>

      <p className="mt-2 text-xs text-kode01-noir/60">
        {t('launcher.form.image_dimensions_hint', {
          width: preferredSize.width,
          height: preferredSize.height,
        })}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
        <div className="grid gap-2">
          <Label htmlFor={`creative-file-${placementSlug}`}>
            {t('launcher.form.image_file')}
          </Label>
          <Input
            id={`creative-file-${placementSlug}`}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            onChange={(event) => {
              void onPlacementFileChange(placementSlug, event);
            }}
            className="h-11 rounded-2xl border-black/10 bg-white file:mr-3 file:rounded-full file:border file:border-black/15 file:px-3 file:py-1 file:text-[11px] file:font-bold file:uppercase file:tracking-widest"
            disabled={isSubmitting}
          />
          {placementAsset.file ? (
            <p className="text-xs text-kode01-noir/65">
              {t('launcher.form.file_selected', {
                name: placementAsset.file.name,
                width: placementAsset.width ?? 0,
                height: placementAsset.height ?? 0,
              })}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`creative-pages-${placementSlug}`}>
            {t('launcher.form.pages_count')}
          </Label>
          <Input
            id={`creative-pages-${placementSlug}`}
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            value={pagesValue}
            onChange={(event) => onPlacementPagesChange(placementSlug, event.target.value)}
            className="h-11 rounded-2xl border-black/10"
            disabled={isSubmitting}
          />
          <p className="text-[11px] text-kode01-noir/55">
            {placementSlug === 'news'
              ? t('launcher.form.pages_hint_news')
              : t('launcher.form.pages_hint_newsletter')}
          </p>
        </div>
      </div>

      {isUploadingThisPlacement ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/60">
          <Loader2 size={12} className="animate-spin" />
          {t('launcher.form.uploading')}
        </p>
      ) : (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-kode01-noir/55">
          <Upload size={12} />
          {t('launcher.form.upload_hint')}
        </p>
      )}
    </div>
  );
}

type DetailsStepSectionProps = {
  campaignName: string;
  creativeTitle: string;
  ctaText: string;
  destinationUrl: string;
  destinationKind: CampaignDestinationKind;
  placementSlugs: PlacementSlug[];
  assetStates: Record<PlacementSlug, PlacementAssetState>;
  pagesByPlacement: Record<PlacementSlug, string>;
  uploadingPlacement: PlacementSlug | null;
  isSubmitting: boolean;
  totalPrice: number;
  locale: string;
  displayCurrency: string;
  onCampaignNameChange: (value: string) => void;
  onCreativeTitleChange: (value: string) => void;
  onCtaTextChange: (value: string) => void;
  onDestinationKindChange: (value: CampaignDestinationKind) => void;
  onDestinationUrlChange: (value: string) => void;
  onPlacementFileChange: (placementSlug: PlacementSlug, event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onPlacementPagesChange: (placementSlug: PlacementSlug, value: string) => void;
  getPlacementLabel: (placementSlug: PlacementSlug) => string;
  getPlacementPreferredSize: (placementSlug: PlacementSlug) => { width: number; height: number };
};

export function DetailsStepSection({
  campaignName,
  creativeTitle,
  ctaText,
  destinationUrl,
  destinationKind,
  placementSlugs,
  assetStates,
  pagesByPlacement,
  uploadingPlacement,
  isSubmitting,
  totalPrice,
  locale,
  displayCurrency,
  onCampaignNameChange,
  onCreativeTitleChange,
  onCtaTextChange,
  onDestinationKindChange,
  onDestinationUrlChange,
  onPlacementFileChange,
  onPlacementPagesChange,
  getPlacementLabel,
  getPlacementPreferredSize,
}: DetailsStepSectionProps) {
  const t = useTranslations('dashboard.buyer.ads');

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="campaign-name">{t('launcher.form.campaign_name')}</Label>
        <Input
          id="campaign-name"
          value={campaignName}
          onChange={(event) => onCampaignNameChange(event.target.value)}
          placeholder={t('launcher.form.campaign_name_placeholder')}
          className="h-11 rounded-2xl border-black/10"
          autoFocus
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="creative-title">{t('launcher.form.title')}</Label>
        <Input
          id="creative-title"
          value={creativeTitle}
          onChange={(event) => onCreativeTitleChange(event.target.value)}
          placeholder={t('launcher.form.title_placeholder')}
          className="h-11 rounded-2xl border-black/10"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="creative-cta">{t('launcher.form.cta')}</Label>
          <Input
            id="creative-cta"
            value={ctaText}
            onChange={(event) => onCtaTextChange(event.target.value)}
            placeholder={t('launcher.form.cta_placeholder')}
            className="h-11 rounded-2xl border-black/10"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="destination-kind">{t('launcher.form.destination_kind')}</Label>
          <select
            id="destination-kind"
            value={destinationKind}
            onChange={(event) => onDestinationKindChange(event.target.value as CampaignDestinationKind)}
            className="h-11 rounded-2xl border border-black/10 bg-white px-3 text-sm text-kode01-noir"
          >
            <option value="external">{t('launcher.form.destination_external')}</option>
            <option value="internal">{t('launcher.form.destination_internal')}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="destination-url">{t('launcher.form.destination_url')}</Label>
        <Input
          id="destination-url"
          value={destinationUrl}
          onChange={(event) => onDestinationUrlChange(event.target.value)}
          placeholder={t('launcher.form.destination_url_placeholder')}
          className="h-11 rounded-2xl border-black/10"
        />
      </div>

      <div className="rounded-2xl border border-black/10 bg-kode01-cream/35 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/60">
          {t('launcher.form.assets_title')}
        </p>
        <p className="mt-1 text-xs text-kode01-noir/60">
          {t('launcher.form.assets_subtitle', {
            formats: ACCEPTED_FILE_FORMAT_LABEL,
            maxSizeMb: MAX_FILE_SIZE_MB,
          })}
        </p>

        <div className="mt-4 grid gap-3">
          {placementSlugs.map((placementSlug) => (
            <PlacementAssetCard
              key={placementSlug}
              placementSlug={placementSlug}
              placementAsset={assetStates[placementSlug]}
              pagesValue={pagesByPlacement[placementSlug]}
              isSubmitting={isSubmitting}
              isUploadingThisPlacement={uploadingPlacement === placementSlug && isSubmitting}
              getPlacementLabel={getPlacementLabel}
              getPlacementPreferredSize={getPlacementPreferredSize}
              onPlacementFileChange={onPlacementFileChange}
              onPlacementPagesChange={onPlacementPagesChange}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-kode01-cream/45 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
          {t('launcher.total_label')}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-2xl font-black text-kode01-noir">
            {formatMoney(totalPrice, locale, displayCurrency)}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
            <Megaphone size={12} />
            {placementSlugs.length}
          </span>
        </div>
      </div>
    </div>
  );
}

type LauncherFooterActionsProps = {
  step: LauncherStep;
  canCreate: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onClose: () => void;
  onContinue: () => void;
};

export function LauncherFooterActions({
  step,
  canCreate,
  isSubmitting,
  onBack,
  onClose,
  onContinue,
}: LauncherFooterActionsProps) {
  const t = useTranslations('dashboard.buyer.ads');

  return (
    <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-black/10 bg-kode01-white p-4 sm:px-8 sm:py-5 sm:flex-row sm:justify-end">
      {step === 'details' ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-black/15"
          onClick={onBack}
          disabled={isSubmitting}
        >
          {t('launcher.back')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="rounded-full border-black/15"
        onClick={onClose}
        disabled={isSubmitting}
      >
        {t('launcher.close')}
      </Button>
      {step === 'offers' ? (
        <Button
          type="button"
          className="rounded-full bg-kode01-noir text-kode01-white hover:bg-kode01-noir/90"
          onClick={onContinue}
          disabled={!canCreate}
        >
          {t('launcher.continue')}
        </Button>
      ) : (
        <Button
          type="submit"
          className="rounded-full bg-kode01-pink font-bold text-kode01-noir hover:bg-kode01-pink/90"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {isSubmitting ? t('launcher.submitting') : t('launcher.submit')}
        </Button>
      )}
    </div>
  );
}
