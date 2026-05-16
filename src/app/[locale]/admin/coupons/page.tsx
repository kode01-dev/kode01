import { redirect } from 'next/navigation';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { AdminCouponsTopUsedPanel } from '@/features/admin/coupons/components/AdminCouponsTopUsedPanel';

export default async function AdminCouponsPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const isFr = locale === 'fr';
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
    <DashboardShell
      role="admin"
      locale={locale}
      title={isFr ? 'Coupons' : 'Coupons'}
      subtitle={isFr ? 'Suivi des coupons les plus utilisés' : 'Track the most used coupons'}
    >
      <AdminCouponsTopUsedPanel locale={locale} />
    </DashboardShell>
  );
}
