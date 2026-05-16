import { DashboardShell } from '@/features/dashboard/components/DashboardShell';
import { MarketingCampaignsTable } from '@/features/marketing/components/MarketingCampaignsTable';
import { MarketingStatsCards } from '@/features/marketing/components/MarketingStatsCards';
import { CreateCampaignButton } from '@/features/marketing/components/CreateCampaignButton';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { MarketingCampaign } from '@/features/marketing/types';

export default async function AdminMarketingPage(
  props: { params: Promise<{ locale: string }> }
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin.marketing');
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/${locale}/buyer`);

  // Fetch campaigns
  const { data: campaigns } = await supabase
    .from('marketing_campaigns')
    .select(
      `
      *,
      template:marketing_templates(*)
    `
    )
    .order('created_at', { ascending: false });

  // Compute stats
  const activeCampaigns =
    campaigns?.filter((c) => c.status === 'active').length || 0;
  const totalViews = campaigns?.reduce((sum, c) => sum + c.view_count, 0) || 0;
  const totalClicks =
    campaigns?.reduce((sum, c) => sum + c.click_count, 0) || 0;
  const avgCTR =
    totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';

  return (
    <DashboardShell role="admin" locale={locale} title={t('title')} subtitle={t('subtitle')}>
      {/* Header with create button */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-serif font-black text-black">
            {t('campaigns_title')}
          </h1>
        </div>
        <CreateCampaignButton />
      </div>

      {/* Stats cards */}
      <MarketingStatsCards
        activeCampaigns={activeCampaigns}
        totalViews={totalViews}
        totalClicks={totalClicks}
        avgCTR={avgCTR}
      />

      {/* Campaigns table */}
      <div className="mt-8">
        <MarketingCampaignsTable campaigns={(campaigns || []) as unknown as MarketingCampaign[]} locale={locale} />
      </div>
    </DashboardShell>
  );
}
