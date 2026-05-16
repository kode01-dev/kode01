import { DashboardShell } from '@/features/dashboard/components/DashboardShell';
import { CampaignForm } from '@/features/marketing/components/CampaignForm';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function CreateCampaignPage(
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

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      <div className="max-w-4xl">
        <h1 className="text-2xl font-serif font-black text-black mb-8">
          {t('create_campaign')}
        </h1>
        <CampaignForm />
      </div>
    </DashboardShell>
  );
}
