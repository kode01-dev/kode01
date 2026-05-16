'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DetailsStepSection,
  LauncherDialogHeader,
  LauncherFooterActions,
  LauncherStepIndicator,
  OffersStepSection,
} from './AdsCampaignLauncherSections';
import type {
  CampaignDestinationKind,
  CampaignNewsFormat,
  LauncherStep,
  PlacementAssetState,
  PlacementMultipliers,
  PlacementSlug,
  PricingPlanOption,
} from './adsCampaignLauncher.types';
import {
  ACCEPTED_FILE_FORMAT_LABEL,
  ACCEPTED_MIME_FORMATS,
  MAX_FILE_SIZE_MB,
  createInitialAssetStates,
  isHttpsUrl,
  normalizeApiError,
  readImageDimensions,
} from './adsCampaignLauncher.utils';

type AdsCampaignLauncherProps = {
  locale: string;
  guideHref: string;
  plans: PricingPlanOption[];
  multipliers: PlacementMultipliers;
};

export function AdsCampaignLauncher({
  locale,
  guideHref,
  plans,
  multipliers,
}: AdsCampaignLauncherProps) {
  const t = useTranslations('dashboard.buyer.ads');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<LauncherStep>('offers');
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '');
  const [newsFormat, setNewsFormat] = useState<CampaignNewsFormat | null>(null);
  const [includeNewsletter, setIncludeNewsletter] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [creativeTitle, setCreativeTitle] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [destinationKind, setDestinationKind] = useState<CampaignDestinationKind>('external');
  const [assetStates, setAssetStates] = useState<Record<PlacementSlug, PlacementAssetState>>(
    createInitialAssetStates(),
  );
  const [pagesByPlacement, setPagesByPlacement] = useState<Record<PlacementSlug, string>>({
    news: '1',
    newsletter_footer: '1',
  });
  const [uploadingPlacement, setUploadingPlacement] = useState<PlacementSlug | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const placementSlugs = useMemo(() => {
    const slugs: PlacementSlug[] = [];
    if (newsFormat) slugs.push('news');
    if (includeNewsletter) slugs.push('newsletter_footer');
    return slugs;
  }, [newsFormat, includeNewsletter]);

  const newsMultiplier = newsFormat
    ? newsFormat === 'split'
      ? multipliers.news * 0.5
      : multipliers.news
    : 0;
  const newsletterMultiplier = includeNewsletter ? multipliers.newsletterFooter : 0;
  const totalMultiplier = newsMultiplier + newsletterMultiplier;
  const totalPrice = selectedPlan ? selectedPlan.basePrice * totalMultiplier : 0;
  const displayCurrency = selectedPlan?.currency ?? 'cad';

  const canCreate = plans.length > 0;

  function resetState() {
    setStep('offers');
    setSelectedPlanId(plans[0]?.id ?? '');
    setNewsFormat(null);
    setIncludeNewsletter(false);
    setCampaignName('');
    setCreativeTitle('');
    setCtaText('');
    setDestinationUrl('');
    setDestinationKind('external');
    setAssetStates(createInitialAssetStates());
    setPagesByPlacement({
      news: '1',
      newsletter_footer: '1',
    });
    setUploadingPlacement(null);
    setFormError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) return;
    setOpen(nextOpen);
    if (nextOpen) resetState();
  }

  function validateOfferStep() {
    if (!canCreate) return t('errors.catalog_unavailable');
    if (!selectedPlanId) return t('errors.plan_required');
    if (!newsFormat && !includeNewsletter) return t('errors.offer_required');
    return null;
  }

  function validateDetailsStep() {
    if (!campaignName.trim()) return t('errors.campaign_name_required');
    if (!creativeTitle.trim()) return t('errors.title_required');
    if (!ctaText.trim()) return t('errors.cta_required');
    if (!destinationUrl.trim()) return t('errors.destination_required');

    if (destinationKind === 'internal') {
      if (!destinationUrl.trim().startsWith('/')) return t('errors.destination_internal');
    } else if (!isHttpsUrl(destinationUrl.trim())) {
      return t('errors.destination_https');
    }

    for (const placementSlug of placementSlugs) {
      const pagesValue = pagesByPlacement[placementSlug]?.trim() ?? '';
      const pagesCount = Number(pagesValue);
      if (!pagesValue) {
        return t('errors.pages_required', { slot: getPlacementLabel(placementSlug) });
      }
      if (!Number.isInteger(pagesCount) || pagesCount < 1 || pagesCount > 500) {
        return t('errors.pages_invalid', { slot: getPlacementLabel(placementSlug) });
      }

      const asset = assetStates[placementSlug];
      if (!asset.file && !asset.uploadedUrl) {
        return t('errors.image_required_slot', { slot: getPlacementLabel(placementSlug) });
      }
      if (asset.file && !ACCEPTED_MIME_FORMATS.has(asset.file.type)) {
        return t('errors.image_format', { slot: getPlacementLabel(placementSlug), formats: ACCEPTED_FILE_FORMAT_LABEL });
      }
      if (asset.file && asset.file.size > adCreativeGuidelines.maxFileSizeBytes) {
        return t('errors.image_size', { slot: getPlacementLabel(placementSlug), maxSizeMb: MAX_FILE_SIZE_MB });
      }
    }

    return null;
  }

  function getPlacementLabel(placementSlug: PlacementSlug) {
    if (placementSlug === 'news') {
      if (newsFormat === 'full') return t('launcher.offers.full.title');
      return t('launcher.offers.split.title');
    }
    return t('launcher.offers.newsletter.title');
  }

  function getPlacementPreferredSize(placementSlug: PlacementSlug) {
    if (placementSlug === 'news') {
      return adCreativeGuidelines.placementRestrictions.news.preferredSize;
    }

    const fallbackSize = adCreativeGuidelines.recommendedSizes[0];
    return { width: fallbackSize.width, height: fallbackSize.height };
  }

  async function handlePlacementFileChange(placementSlug: PlacementSlug, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (!file) return;

    if (!ACCEPTED_MIME_FORMATS.has(file.type)) {
      setFormError(
        t('errors.image_format', {
          slot: getPlacementLabel(placementSlug),
          formats: ACCEPTED_FILE_FORMAT_LABEL,
        }),
      );
      return;
    }

    if (file.size > adCreativeGuidelines.maxFileSizeBytes) {
      setFormError(
        t('errors.image_size', {
          slot: getPlacementLabel(placementSlug),
          maxSizeMb: MAX_FILE_SIZE_MB,
        }),
      );
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      setAssetStates((current) => ({
        ...current,
        [placementSlug]: {
          file,
          uploadedUrl: null,
          width: dimensions.width,
          height: dimensions.height,
        },
      }));
      setFormError(null);
    } catch {
      setFormError(t('errors.image_read_failed'));
    }
  }

  async function uploadCreativeForPlacement(placementSlug: PlacementSlug) {
    const placementAsset = assetStates[placementSlug];
    if (placementAsset.uploadedUrl) return placementAsset.uploadedUrl;
    if (!placementAsset.file) {
      throw new Error(t('errors.image_required_slot', { slot: getPlacementLabel(placementSlug) }));
    }

    setUploadingPlacement(placementSlug);
    const formData = new FormData();
    formData.set('placementSlug', placementSlug);
    formData.set('file', placementAsset.file);

    const response = await fetch('/api/ads/uploads', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(normalizeApiError(payload, t('errors.upload_failed')));
    }

    const uploadedUrl = (payload as { data?: { url?: string } })?.data?.url;
    if (!uploadedUrl) {
      throw new Error(t('errors.upload_failed'));
    }

    setAssetStates((current) => ({
      ...current,
      [placementSlug]: {
        ...current[placementSlug],
        uploadedUrl,
      },
    }));

    setUploadingPlacement(null);
    return uploadedUrl;
  }

  function handleContinue() {
    const error = validateOfferStep();
    setFormError(error);
    if (error) return;
    setStep('details');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const offerError = validateOfferStep();
    if (offerError) {
      setStep('offers');
      setFormError(offerError);
      return;
    }

    const detailsError = validateDetailsStep();
    if (detailsError) {
      setFormError(detailsError);
      return;
    }

    if (!selectedPlan) {
      setFormError(t('errors.plan_required'));
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const uploadedByPlacement = new Map<PlacementSlug, string>();
      for (const placementSlug of placementSlugs) {
        const uploadedUrl = await uploadCreativeForPlacement(placementSlug);
        uploadedByPlacement.set(placementSlug, uploadedUrl);
      }

      const creativeSlots = placementSlugs.map((placementSlug) => ({
        placementSlug,
        imageUrl: uploadedByPlacement.get(placementSlug) ?? '',
        pagesCount: Number(pagesByPlacement[placementSlug] || 1),
      }));

      const campaignResponse = await fetch('/api/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          advertiserType: 'user',
          pricingPlanId: selectedPlan.id,
          placementSlugs,
          ...(newsFormat ? { newsFormat } : {}),
          creative: {
            title: creativeTitle.trim(),
            ctaText: ctaText.trim(),
            imageUrl: creativeSlots[0]?.imageUrl ?? '',
            destinationUrl: destinationUrl.trim(),
            destinationKind,
            locale: locale === 'fr' ? 'fr' : 'en',
          },
          creativeSlots,
        }),
      });

      const campaignPayload = await campaignResponse.json().catch(() => null);
      if (!campaignResponse.ok) {
        throw new Error(normalizeApiError(campaignPayload, t('errors.create_failed')));
      }

      const campaignId = (campaignPayload as { data?: { campaign?: { id?: string } } })?.data?.campaign?.id;
      if (!campaignId) {
        throw new Error(t('errors.create_failed'));
      }

      const checkoutResponse = await fetch(`/api/ads/campaigns/${campaignId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });

      const checkoutPayload = await checkoutResponse.json().catch(() => null);
      if (!checkoutResponse.ok) {
        throw new Error(normalizeApiError(checkoutPayload, t('errors.checkout_failed')));
      }

      const checkoutUrl = (checkoutPayload as { url?: string })?.url;
      if (!checkoutUrl) {
        throw new Error(t('errors.checkout_failed'));
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('errors.unexpected'));
      setIsSubmitting(false);
      setUploadingPlacement(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="inline-flex items-center gap-2 rounded-full bg-kode01-noir px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-white shadow-lg transition-all hover:bg-kode01-noir/80 hover:shadow-xl"
      >
        <Plus size={16} />
        {t('create_campaign')}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex h-[100dvh] w-screen max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden rounded-none border-0 bg-kode01-white p-0 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:w-[92vw] sm:max-w-4xl sm:rounded-[32px] sm:border sm:border-black/10"
        >
          <LauncherDialogHeader guideHref={guideHref} />

          <form className="flex flex-col flex-1 min-h-0 overflow-hidden" onSubmit={handleSubmit}>
            <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <LauncherStepIndicator step={step} />

              {step === 'offers' ? (
                <OffersStepSection
                  plans={plans}
                  selectedPlanId={selectedPlanId}
                  selectedPlan={selectedPlan}
                  newsFormat={newsFormat}
                  includeNewsletter={includeNewsletter}
                  multipliers={multipliers}
                  locale={locale}
                  displayCurrency={displayCurrency}
                  totalPrice={totalPrice}
                  onSelectPlan={(planId) => {
                    setSelectedPlanId(planId);
                    setFormError(null);
                  }}
                  onToggleNewsFormat={(format) => {
                    setNewsFormat((current) => (current === format ? null : format));
                    setFormError(null);
                  }}
                  onToggleNewsletter={() => {
                    setIncludeNewsletter((value) => !value);
                    setFormError(null);
                  }}
                />
              ) : (
                <DetailsStepSection
                  campaignName={campaignName}
                  creativeTitle={creativeTitle}
                  ctaText={ctaText}
                  destinationUrl={destinationUrl}
                  destinationKind={destinationKind}
                  placementSlugs={placementSlugs}
                  assetStates={assetStates}
                  pagesByPlacement={pagesByPlacement}
                  uploadingPlacement={uploadingPlacement}
                  isSubmitting={isSubmitting}
                  totalPrice={totalPrice}
                  locale={locale}
                  displayCurrency={displayCurrency}
                  onCampaignNameChange={setCampaignName}
                  onCreativeTitleChange={setCreativeTitle}
                  onCtaTextChange={setCtaText}
                  onDestinationKindChange={setDestinationKind}
                  onDestinationUrlChange={setDestinationUrl}
                  onPlacementFileChange={handlePlacementFileChange}
                  onPlacementPagesChange={(placementSlug, value) => {
                    setPagesByPlacement((current) => ({
                      ...current,
                      [placementSlug]: value,
                    }));
                  }}
                  getPlacementLabel={getPlacementLabel}
                  getPlacementPreferredSize={getPlacementPreferredSize}
                />
              )}

              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <LauncherFooterActions
              step={step}
              canCreate={canCreate}
              isSubmitting={isSubmitting}
              onBack={() => {
                setStep('offers');
                setFormError(null);
              }}
              onClose={() => handleOpenChange(false)}
              onContinue={handleContinue}
            />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
