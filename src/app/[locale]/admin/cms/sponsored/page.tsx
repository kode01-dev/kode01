import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { CmsSponsoredPanel } from '@/features/editorial/components/CmsSponsoredPanel';

export default async function CmsSponsoredPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin.cms.sponsored');
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
      <CmsSponsoredPanel locale={locale} />
    </DashboardShell>
  );
}
