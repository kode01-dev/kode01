import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AdminLockscreenPanel } from '@/features/site-lockscreen/components/AdminLockscreenPanel';

interface AdminLockscreenPageProps {
  params: Promise<{
    locale: string;
  }>;
}

export default async function AdminLockscreenPage({ params }: AdminLockscreenPageProps) {
  const { locale } = await params;
  const t = await getTranslations('dashboard.admin.lockscreen');

  // Check admin authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    redirect('/');
  }

  return (
    <DashboardShell role="admin" locale={locale} title={t('title')}>
      <AdminLockscreenPanel />
    </DashboardShell>
  );
}
