import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { CampaignForm } from '@/features/marketing/components/CampaignForm';
import type { MarketingCampaign } from '@/features/marketing/types';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

interface EditCampaignPageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export async function generateMetadata({ params }: EditCampaignPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.admin.marketing' });

  return applySeoMetadata({
    title: t('edit_title'),
    description: t('edit_description'),
  }, '/admin/marketing/[id]/edit', { locale, id });
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.admin.marketing' });
  const supabase = await createClient();

  // Check admin role
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return notFound();
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return notFound();
  }

  // Fetch campaign
  const { data: campaign, error } = await supabase
    .from('marketing_campaigns')
    .select(
      `
      *,
      template:marketing_templates(*)
    `
    )
    .eq('id', id)
    .single();

  if (error || !campaign) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-black/2 py-8">
      <SeoAppJsonLd pathname={`/admin/marketing/${id}/edit`} />
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-black mb-2">{t('edit_title')}</h1>
          <p className="text-black/60">{campaign.name}</p>
        </div>

        <CampaignForm campaign={campaign as unknown as MarketingCampaign} isEdit={true} />
      </div>
    </div>
  );
}
