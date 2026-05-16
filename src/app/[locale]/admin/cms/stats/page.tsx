import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { CmsStatsPanel } from '@/features/editorial/components/CmsStatsPanel';

export default async function CmsStatsPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin.cms');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    redirect(`/${locale}/admin`);
  }

  return (
    <DashboardShell role="admin" locale={locale} title={t('stats.title')} subtitle={t('stats.subtitle')}>
      <CmsStatsPanel locale={locale} />
    </DashboardShell>
  );
}
