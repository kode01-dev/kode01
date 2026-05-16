import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { ApiMonitoringPanel } from '@/features/admin/api-monitoring/components/ApiMonitoringPanel';
import { isApiMonitoringEnabledServer } from '@/features/api-monitoring/shared/feature-flag';

export default async function AdminApiMonitoringPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  if (!isApiMonitoringEnabledServer()) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations('dashboard.admin.api_monitoring');
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
    <DashboardShell role="admin" locale={locale} title={t('title')} subtitle={t('subtitle')}>
      <div className="mt-6">
        <ApiMonitoringPanel locale={locale} />
      </div>
    </DashboardShell>
  );
}
