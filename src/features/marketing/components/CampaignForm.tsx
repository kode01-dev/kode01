'use client';

import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Calendar, AlertCircle, Loader2 } from 'lucide-react';
import { FormPanelSkeleton } from '@/components/skeletons';
import type { MarketingCampaign, MarketingTemplate } from '../types';
import { TemplateSelector } from './TemplateSelector';
import { TargetingRulesEditor } from './TargetingRulesEditor';
import { TriggerConfigEditor } from './TriggerConfigEditor';
import { CampaignPreview } from './CampaignPreview';
import { optionalCtaUrlInputSchema } from '@/lib/security/cta-url-schema';

const optionalUrlSchema = z.union([z.literal(''), z.string().url('Must be a valid URL')]).optional();
// Validation schema matching the API
const campaignFormSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  template_id: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'archived']),

  title_en: z.string().min(1, 'English title is required'),
  title_fr: z.string().min(1, 'French title is required'),
  body_en: z.string().optional(),
  body_fr: z.string().optional(),
  cta_text_en: z.string().optional(),
  cta_text_fr: z.string().optional(),
  cta_url: optionalCtaUrlInputSchema,

  image_url: optionalUrlSchema,
  background_image_url: optionalUrlSchema,

  start_at: z.string().optional(),
  end_at: z.string().optional(),

  targeting_rules: z.object({
    pages: z.array(z.string()),
    excludePages: z.array(z.string()),
    userRoles: z.array(z.string()),
    locales: z.array(z.string()),
    deviceTypes: z.array(z.enum(['desktop', 'mobile', 'tablet'])),
  }),

  trigger_type: z.enum(['page_load', 'scroll_depth', 'time_delay', 'exit_intent', 'manual']),
  trigger_config: z.object({
    delay: z.number().optional(),
    scrollDepth: z.number().optional(),
    showOnce: z.boolean().optional(),
    cooldownHours: z.number().optional(),
  }),

  priority: z.number().int().min(0),
});

type FormData = z.infer<typeof campaignFormSchema>;

interface CampaignFormProps {
  campaign?: MarketingCampaign;
  isEdit?: boolean;
}

function toDateTimeLocalValue(value?: string): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  // Normalize to local datetime input format: YYYY-MM-DDTHH:mm
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoOrNull(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNullableText(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function CampaignForm({ campaign, isEdit = false }: CampaignFormProps) {
  const t = useTranslations('marketing.form');
  const router = useRouter();
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: campaign
      ? {
          name: campaign.name,
          template_id: campaign.template_id ?? null,
          status: campaign.status,
          title_en: campaign.title_en,
          title_fr: campaign.title_fr,
          body_en: campaign.body_en ?? '',
          body_fr: campaign.body_fr ?? '',
          cta_text_en: campaign.cta_text_en ?? '',
          cta_text_fr: campaign.cta_text_fr ?? '',
          cta_url: campaign.cta_url ?? '',
          image_url: campaign.image_url ?? '',
          background_image_url: campaign.background_image_url ?? '',
          start_at: toDateTimeLocalValue(campaign.start_at ?? undefined),
          end_at: toDateTimeLocalValue(campaign.end_at ?? undefined),
          targeting_rules: campaign.targeting_rules,
          trigger_type: campaign.trigger_type,
          trigger_config: campaign.trigger_config,
          priority: campaign.priority,
        }
      : {
          name: '',
          template_id: null,
          status: 'draft',
          title_en: '',
          title_fr: '',
          body_en: '',
          body_fr: '',
          cta_text_en: '',
          cta_text_fr: '',
          cta_url: '',
          image_url: '',
          background_image_url: '',
          start_at: '',
          end_at: '',
          targeting_rules: {
            pages: ['/'],
            excludePages: [],
            userRoles: ['all'],
            locales: ['en', 'fr'],
            deviceTypes: ['desktop', 'mobile', 'tablet'],
          },
          trigger_type: 'page_load',
          trigger_config: { delay: 0, cooldownHours: 24 },
          priority: 0,
        },
  });

  // Watch for preview updates
  const watchedValues = watch();
  const selectedTemplate = templates.find((t) => t.id === watchedValues.template_id);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/marketing/templates', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Failed to fetch templates');
        }
        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (err) {
        console.error('Error fetching templates:', err);
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const onSubmit = async (data: FormData) => {
    try {
      setSubmitting(true);
      setError(null);

      const url = isEdit && campaign ? `/api/admin/marketing/campaigns/${campaign.id}` : '/api/admin/marketing/campaigns';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...data,
        body_en: toNullableText(data.body_en),
        body_fr: toNullableText(data.body_fr),
        cta_text_en: toNullableText(data.cta_text_en),
        cta_text_fr: toNullableText(data.cta_text_fr),
        cta_url: toNullableText(data.cta_url),
        image_url: toNullableText(data.image_url),
        background_image_url: toNullableText(data.background_image_url),
        start_at: toIsoOrNull(data.start_at),
        end_at: toIsoOrNull(data.end_at),
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save campaign');
      }

      router.push('/admin/marketing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Error submitting form:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <FormPanelSkeleton />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[12px] p-4 flex gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 text-sm">{t('error')}</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Left */}
        <div className="lg:col-span-2 space-y-8">
          {/* Basic Info Section */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('basicInfo')}</h3>

            <div className="space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('campaignName')}
                </label>
                <input
                  {...register('name')}
                  type="text"
                  placeholder="e.g., Summer Newsletter Campaign"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
                {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name.message}</p>}
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('status')}
                </label>
                <select
                  {...register('status')}
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
                {errors.status && <p className="text-red-600 text-xs mt-1">{errors.status.message}</p>}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('priority')}
                </label>
                <input
                  {...register('priority', { valueAsNumber: true })}
                  type="number"
                  placeholder="0"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
                {errors.priority && <p className="text-red-600 text-xs mt-1">{errors.priority.message}</p>}
              </div>
            </div>
          </div>

          {/* Template Selection */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('selectTemplate')}</h3>
            <Controller
              name="template_id"
              control={control}
              render={({ field }) => <TemplateSelector templates={templates} value={field.value} onChange={field.onChange} />}
            />
          </div>

          {/* Bilingual Content Section */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('bilingualContent')}</h3>

            <div className="space-y-6">
              {/* English Content */}
              <div className="space-y-4 pb-6 border-b border-black/5">
                <h4 className="font-bold text-black/80">{t('english')}</h4>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                    {t('title')} (EN)
                  </label>
                  <input
                    {...register('title_en')}
                    type="text"
                    placeholder="Campaign title in English"
                    className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                  />
                  {errors.title_en && <p className="text-red-600 text-xs mt-1">{errors.title_en.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                    {t('body')} (EN)
                  </label>
                  <textarea
                    {...register('body_en')}
                    placeholder="Optional body text in English"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                      {t('ctaText')} (EN)
                    </label>
                    <input
                      {...register('cta_text_en')}
                      type="text"
                      placeholder="Button text"
                      className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* French Content */}
              <div className="space-y-4">
                <h4 className="font-bold text-black/80">{t('french')}</h4>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                    {t('title')} (FR)
                  </label>
                  <input
                    {...register('title_fr')}
                    type="text"
                    placeholder="Titre de la campagne en français"
                    className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                  />
                  {errors.title_fr && <p className="text-red-600 text-xs mt-1">{errors.title_fr.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                    {t('body')} (FR)
                  </label>
                  <textarea
                    {...register('body_fr')}
                    placeholder="Texte de corps optionnel en français"
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                      {t('ctaText')} (FR)
                    </label>
                    <input
                      {...register('cta_text_fr')}
                      type="text"
                      placeholder="Texte du bouton"
                      className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA URL */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('ctaUrl')}</h3>
            <input
              {...register('cta_url')}
              type="text"
              placeholder="https://example.com or /path/to/page"
              className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
            />
            {errors.cta_url && <p className="text-red-600 text-xs mt-2">{errors.cta_url.message}</p>}
          </div>

          {/* Media Section */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('media')}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('imageUrl')}
                </label>
                <input
                  {...register('image_url')}
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
                {errors.image_url && <p className="text-red-600 text-xs mt-1">{errors.image_url.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('backgroundImageUrl')}
                </label>
                <input
                  {...register('background_image_url')}
                  type="text"
                  placeholder="https://example.com/bg.jpg"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
                {errors.background_image_url && (
                  <p className="text-red-600 text-xs mt-1">{errors.background_image_url.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Scheduling */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Calendar size={20} />
              {t('scheduling')}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('startDate')}
                </label>
                <input
                  {...register('start_at')}
                  type="datetime-local"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('endDate')}
                </label>
                <input
                  {...register('end_at')}
                  type="datetime-local"
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Targeting Rules */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('targetingRules')}</h3>
            <Controller
              name="targeting_rules"
              control={control}
              render={({ field }) => <TargetingRulesEditor value={field.value} onChange={field.onChange} />}
            />
          </div>

          {/* Trigger Configuration */}
          <div className="bg-white rounded-[24px] border border-black/5 p-6">
            <h3 className="font-bold text-lg mb-4">{t('triggerConfiguration')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
                  {t('triggerType')}
                </label>
                <select
                  {...register('trigger_type')}
                  className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
                >
                  <option value="page_load">Page Load</option>
                  <option value="scroll_depth">Scroll Depth</option>
                  <option value="time_delay">Time Delay</option>
                  <option value="exit_intent">Exit Intent</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <Controller
                name="trigger_config"
                control={control}
                render={({ field }) => (
                  <TriggerConfigEditor triggerType={watchedValues.trigger_type} value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 bg-kode01-pink text-white rounded-full font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t(isEdit ? 'updateCampaign' : 'createCampaign')
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push('/admin/marketing')}
              className="flex-1 py-3 bg-black/5 text-black rounded-full font-bold hover:bg-black/10 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>

        {/* Preview - Right */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <CampaignPreview
              template={selectedTemplate}
              data={{
                campaign_id: campaign?.id || 'preview',
                template_type: selectedTemplate?.template_type || 'popup_center',
                title: watchedValues.title_en,
                body: watchedValues.body_en,
                cta_text: watchedValues.cta_text_en,
                cta_url: watchedValues.cta_url,
                image_url: watchedValues.image_url,
                trigger_type: watchedValues.trigger_type,
                trigger_config: watchedValues.trigger_config,
                priority: watchedValues.priority,
              }}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
