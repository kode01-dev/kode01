'use client';

import { useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileUpload, type UploadedFile, ACCEPTED_IMAGE_TYPES, ACCEPTED_FILE_TYPES } from '@/components/ui/file-upload';
import { useAutoSave, clearAutoSave, restoreAutoSave } from '@/hooks/useAutoSave';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProductFormData {
  title: string;
  description: string;
  category: string;
  tags: string;
  coverImage: UploadedFile | null;
  galleryImages: UploadedFile[];
  productFile: UploadedFile | null;
  price: string;
  enablePwyw: boolean;
  minPrice: string;
  generateLicense: boolean;
}

interface FieldErrors {
  title?: string;
  description?: string;
  price?: string;
  coverImage?: string;
  productFile?: string;
}

const STEPS = ['basics', 'media', 'pricing', 'publish'] as const;

const STORAGE_KEY = 'kode01_product_draft';

const DEFAULT_FORM: ProductFormData = {
  title: '',
  description: '',
  category: '',
  tags: '',
  coverImage: null,
  galleryImages: [],
  productFile: null,
  price: '',
  enablePwyw: false,
  minPrice: '',
  generateLicense: false,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface ProductCreationStepperProps {
  canPublish: boolean;
}

export function ProductCreationStepper({ canPublish }: ProductCreationStepperProps) {
  const t = useTranslations('dashboard.vendor.product_creation');
  const locale = useLocale();

  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<ProductFormData>(() => {
    const restored = restoreAutoSave<ProductFormData>(STORAGE_KEY);
    return restored ?? DEFAULT_FORM;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successState, setSuccessState] = useState<'published' | 'draft' | null>(null);

  // Auto-save
  const { status: saveStatus } = useAutoSave({
    data: form,
    onSave: async () => {
      // Auto-save just writes to localStorage via the hook's built-in mechanism
    },
    delay: 10_000,
    storageKey: STORAGE_KEY,
    storageTtlMs: 4 * 60 * 60 * 1000,
    storageExcludeKeys: ['coverImage', 'galleryImages', 'productFile'],
  });

  /* ---- helpers ---- */

  function updateForm(patch: Partial<ProductFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function uploadFile(file: File, kind: 'cover' | 'gallery' | 'digital_file'): Promise<UploadedFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    const res = await fetch('/api/vendor/uploads', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    const data = await res.json();
    return {
      url: data.url ?? data.publicUrl ?? `${data.bucket}:${data.path}`,
      name: data.name ?? file.name,
      size: data.size ?? file.size,
      type: data.type ?? file.type,
      bucket: data.bucket,
      path: data.path,
      kind: data.kind ?? kind,
    };
  }

  function validateBasics(): boolean {
    const next: FieldErrors = {};
    if (!form.title.trim()) next.title = t('errors.title_required');
    else if (form.title.trim().length < 3 || form.title.trim().length > 200)
      next.title = t('errors.title_length');
    if (!form.description.trim()) next.description = t('errors.description_required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateMedia(): boolean {
    const next: FieldErrors = {};
    if (!form.coverImage) next.coverImage = t('errors.cover_required');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validatePricing(): boolean {
    const next: FieldErrors = {};
    const price = parseFloat(form.price);
    if (form.price && isNaN(price)) next.price = t('errors.price_invalid');
    else if (form.price && price > 0 && price < 1) next.price = t('errors.price_min');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    const step = STEPS[currentStep];
    let valid = true;
    if (step === 'basics') valid = validateBasics();
    else if (step === 'media') valid = validateMedia();
    else if (step === 'pricing') valid = validatePricing();
    if (valid && currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
      setErrors({});
    }
  }

  function goBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setErrors({});
    }
  }

  const handleSubmit = useCallback(
    async (status: 'published' | 'draft') => {
      if (status === 'published' && !canPublish) return;
      setIsSubmitting(true);
      setErrors({});

      try {
        const payload = {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category || null,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 5),
          cover_image_url: form.coverImage?.url || null,
          gallery_urls: form.galleryImages.map((f) => f.url),
          file_path_vault: form.productFile?.path || null,
          price: form.price ? parseFloat(form.price) : 0,
          is_pwyw: form.enablePwyw,
          min_price: form.minPrice ? parseFloat(form.minPrice) : null,
          generates_license_key: form.generateLicense,
          status,
        };

        const res = await fetch('/api/vendor/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error('Save failed');
        }

        clearAutoSave(STORAGE_KEY);
        setSuccessState(status);
      } catch {
        setErrors({ title: t('errors.save_failed') });
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, canPublish, t],
  );

  /* ---- success screen ---- */

  if (successState) {
    const isPublished = successState === 'published';
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-kode01-green/10">
          <CheckCircle2 size={32} className="text-kode01-green" />
        </div>
        <h2 className="font-serif text-2xl font-black text-kode01-noir">
          {isPublished ? t('success_title') : t('success_draft_title')}
        </h2>
        <p className="mt-2 max-w-md text-sm text-kode01-noir/60">
          {isPublished ? t('success_description') : t('success_draft_description')}
        </p>
        <Button
          onClick={() => (window.location.href = `/${locale}/vendor/products`)}
          className="mt-6 rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold px-8 h-11"
        >
          {t('success_cta')}
        </Button>
      </div>
    );
  }

  /* ---- stepper header ---- */

  const stepContent = STEPS[currentStep];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, index) => (
          <div key={step} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => index < currentStep && setCurrentStep(index)}
              disabled={index > currentStep}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                index < currentStep
                  ? 'bg-kode01-green text-white cursor-pointer'
                  : index === currentStep
                    ? 'bg-kode01-pink text-kode01-noir'
                    : 'bg-black/5 text-kode01-noir/30'
              }`}
            >
              {index < currentStep ? <Check size={14} /> : index + 1}
            </button>
            <span
              className={`text-xs font-bold ${
                index === currentStep ? 'text-kode01-noir' : 'text-kode01-noir/30'
              }`}
            >
              {t(`step_${step}`)}
            </span>
            {index < STEPS.length - 1 && (
              <div className={`h-px w-8 ${index < currentStep ? 'bg-kode01-green' : 'bg-black/10'}`} />
            )}
          </div>
        ))}

        {/* Auto-save indicator */}
        <div className="ml-auto text-xs text-kode01-sauge">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
        </div>
      </div>

      {/* Step content */}
      <Card className="rounded-[32px] border-black/5 bg-kode01-white shadow-sm overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          {/* Step 1: Basics */}
          {stepContent === 'basics' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="product-title" className="text-kode01-noir/70">
                  {t('title_label')}
                </Label>
                <Input
                  id="product-title"
                  value={form.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                  placeholder={t('title_placeholder')}
                  className="rounded-2xl border-black/10 h-11"
                  aria-invalid={!!errors.title}
                  autoFocus
                />
                {errors.title ? (
                  <p className="text-xs text-kode01-pink">{errors.title}</p>
                ) : (
                  <p className="text-xs text-kode01-noir/40">{t('title_hint')}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-desc" className="text-kode01-noir/70">
                  {t('description_label')}
                </Label>
                <textarea
                  id="product-desc"
                  rows={6}
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder={t('description_placeholder')}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm focus:border-kode01-pink focus:outline-none focus:ring-2 focus:ring-kode01-pink/20"
                  aria-invalid={!!errors.description}
                />
                {errors.description ? (
                  <p className="text-xs text-kode01-pink">{errors.description}</p>
                ) : (
                  <p className="text-xs text-kode01-noir/40">{t('description_hint')}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="product-category" className="text-kode01-noir/70">
                    {t('category_label')}
                  </Label>
                  <select
                    id="product-category"
                    value={form.category}
                    onChange={(e) => updateForm({ category: e.target.value })}
                    className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm"
                  >
                    <option value="">{t('category_placeholder')}</option>
                    <option value="prompts">Prompts</option>
                    <option value="templates">Templates</option>
                    <option value="tools">Tools</option>
                    <option value="datasets">Datasets</option>
                    <option value="agents">Agents</option>
                    <option value="courses">Courses</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="product-tags" className="text-kode01-noir/70">
                    {t('tags_label')}
                  </Label>
                  <Input
                    id="product-tags"
                    value={form.tags}
                    onChange={(e) => updateForm({ tags: e.target.value })}
                    placeholder={t('tags_placeholder')}
                    className="rounded-2xl border-black/10 h-11"
                  />
                  <p className="text-xs text-kode01-noir/40">{t('tags_hint')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Media */}
          {stepContent === 'media' && (
            <div className="space-y-6">
              <FileUpload
                label={t('cover_label')}
                hint={t('cover_hint')}
                accept={ACCEPTED_IMAGE_TYPES}
                value={form.coverImage ? [form.coverImage] : []}
                onChange={(files) => updateForm({ coverImage: files[0] ?? null })}
                onUpload={(file) => uploadFile(file, 'cover')}
                error={errors.coverImage}
              />

              <FileUpload
                label={t('gallery_label')}
                hint={t('gallery_hint')}
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                value={form.galleryImages}
                onChange={(files) => updateForm({ galleryImages: files.slice(0, 6) })}
                onUpload={(file) => uploadFile(file, 'gallery')}
              />

              <FileUpload
                label={t('file_label')}
                hint={t('file_hint')}
                accept={ACCEPTED_FILE_TYPES}
                value={form.productFile ? [form.productFile] : []}
                onChange={(files) => updateForm({ productFile: files[0] ?? null })}
                onUpload={(file) => uploadFile(file, 'digital_file')}
                error={errors.productFile}
              />
            </div>
          )}

          {/* Step 3: Pricing */}
          {stepContent === 'pricing' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="product-price" className="text-kode01-noir/70">
                  {t('price_label')}
                </Label>
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => updateForm({ price: e.target.value })}
                  placeholder={t('price_placeholder')}
                  className="rounded-2xl border-black/10 h-11 max-w-xs"
                  aria-invalid={!!errors.price}
                />
                {errors.price ? (
                  <p className="text-xs text-kode01-pink">{errors.price}</p>
                ) : (
                  <p className="text-xs text-kode01-noir/40">{t('price_hint')}</p>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-kode01-cream/30 p-4">
                <input
                  type="checkbox"
                  id="pwyw-toggle"
                  checked={form.enablePwyw}
                  onChange={(e) => updateForm({ enablePwyw: e.target.checked })}
                  className="h-4 w-4 rounded accent-kode01-pink"
                />
                <div>
                  <Label htmlFor="pwyw-toggle" className="text-sm font-semibold text-kode01-noir">
                    {t('pwyw_label')}
                  </Label>
                  <p className="text-xs text-kode01-noir/50">{t('pwyw_hint')}</p>
                </div>
              </div>

              {form.enablePwyw && (
                <div className="space-y-1.5 pl-7">
                  <Label htmlFor="min-price" className="text-kode01-noir/70">
                    {t('min_price_label')}
                  </Label>
                  <Input
                    id="min-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minPrice}
                    onChange={(e) => updateForm({ minPrice: e.target.value })}
                    placeholder={t('min_price_placeholder')}
                    className="rounded-2xl border-black/10 h-11 max-w-xs"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-kode01-cream/30 p-4">
                <input
                  type="checkbox"
                  id="license-toggle"
                  checked={form.generateLicense}
                  onChange={(e) => updateForm({ generateLicense: e.target.checked })}
                  className="h-4 w-4 rounded accent-kode01-pink"
                />
                <div>
                  <Label htmlFor="license-toggle" className="text-sm font-semibold text-kode01-noir">
                    {t('license_label')}
                  </Label>
                  <p className="text-xs text-kode01-noir/50">{t('license_hint')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Publish */}
          {stepContent === 'publish' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-serif text-lg font-black text-kode01-noir">{t('review_title')}</h3>
                <p className="text-xs text-kode01-noir/50 mt-1">{t('review_hint')}</p>
              </div>

              {/* Summary */}
              <div className="space-y-4 rounded-2xl border border-black/5 bg-kode01-cream/20 p-5">
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('title_label')}</span>
                  <span className="text-sm font-semibold text-kode01-noir">{form.title || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('price_label')}</span>
                  <span className="text-sm font-semibold text-kode01-noir">
                    {form.price ? `$${form.price}` : 'Free'}
                    {form.enablePwyw && ' (PWYW)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('cover_label')}</span>
                  <span className="text-sm text-kode01-noir/60">{form.coverImage?.name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('file_label')}</span>
                  <span className="text-sm text-kode01-noir/60">{form.productFile?.name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('gallery_label')}</span>
                  <span className="text-sm text-kode01-noir/60">{form.galleryImages.length} images</span>
                </div>
                {form.generateLicense && (
                  <div className="flex justify-between">
                    <span className="text-xs font-bold uppercase text-kode01-noir/40">{t('license_label')}</span>
                    <Badge className="bg-kode01-green/10 text-kode01-green border-0 text-xs">Active</Badge>
                  </div>
                )}
              </div>

              {!canPublish && (
                <div className="rounded-2xl border border-kode01-sauge/30 bg-kode01-sauge/5 px-4 py-3 text-sm text-kode01-sauge">
                  {t('draft_stripe_warning')}
                </div>
              )}

              {errors.title && (
                <div className="rounded-2xl bg-kode01-pink/5 px-3 py-2 text-sm text-kode01-pink">
                  {errors.title}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 0 || isSubmitting}
          className="rounded-full border-black/15 text-kode01-noir hover:bg-black/5 gap-2"
        >
          <ArrowLeft size={16} />
          {t('back')}
        </Button>

        <div className="flex gap-3">
          {stepContent === 'publish' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSubmit('draft')}
                disabled={isSubmitting}
                className="rounded-full border-black/15 text-kode01-noir hover:bg-black/5 font-bold"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                {t('save_draft')}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit('published')}
                disabled={isSubmitting || !canPublish}
                className="rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold px-8"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                {t('publish_now')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold px-8 gap-2"
            >
              {t('next')}
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
