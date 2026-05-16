'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateVendorBusinessProfile } from '@/features/dashboard/actions/vendor-actions';

type VendorBusinessProfileCardProps = {
  initialBusinessUrl: string;
  initialBusinessDescription: string;
  initialBusinessMcc: string;
};

export function VendorBusinessProfileCard(props: VendorBusinessProfileCardProps) {
  const t = useTranslations('dashboard.vendor.business_profile');
  const [businessUrl, setBusinessUrl] = useState(props.initialBusinessUrl);
  const [businessDescription, setBusinessDescription] = useState(props.initialBusinessDescription);
  const [businessMcc, setBusinessMcc] = useState(props.initialBusinessMcc);
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<'validation' | 'unauthorized' | 'forbidden' | 'database' | 'unknown' | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaved(false);
    setErrorKey(null);
    setIsSaving(true);

    try {
      const result = await updateVendorBusinessProfile({
        businessUrl,
        businessDescription,
        businessMcc,
      });

      if (!result.success) {
        setErrorKey(result.error);
        return;
      }

      setIsSaved(true);
    } catch {
      setErrorKey('unknown');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-blue/20 bg-kode01-white shadow-sm">
      <CardContent className="px-6 py-7 sm:px-8">
        <h2 className="font-serif text-2xl font-black text-kode01-noir">{t('title')}</h2>
        <p className="mt-2 text-sm text-kode01-noir/70">{t('description')}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="business-url" className="text-kode01-noir/70">
              {t('website_label')}
            </Label>
            <Input
              id="business-url"
              value={businessUrl}
              onChange={(event) => setBusinessUrl(event.target.value)}
              className="rounded-2xl border-black/10 h-11"
              placeholder="https://www.kode01.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="business-description" className="text-kode01-noir/70">
              {t('business_description_label')}
            </Label>
            <textarea
              id="business-description"
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value)}
              className="min-h-[96px] w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              placeholder={t('business_description_placeholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="business-mcc" className="text-kode01-noir/70">
              {t('industry_mcc_label')}
            </Label>
            <Input
              id="business-mcc"
              value={businessMcc}
              onChange={(event) => setBusinessMcc(event.target.value)}
              className="rounded-2xl border-black/10 h-11"
              placeholder="5817"
              maxLength={4}
            />
          </div>

          {isSaved ? <p className="text-sm text-kode01-green">{t('saved')}</p> : null}
          {errorKey ? <p className="text-sm text-kode01-pink">{t(`errors.${errorKey}`)}</p> : null}

          <Button type="submit" disabled={isSaving} className="rounded-full bg-kode01-blue text-kode01-white hover:bg-kode01-blue/90">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? t('saving') : t('save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
