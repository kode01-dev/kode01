import { redirect } from 'next/navigation';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';
import { VendorCouponsManager } from '@/features/coupons/components/VendorCouponsManager';

export default async function VendorCouponsPage(
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

  if (!profile || !isSellerRole(profile.role)) {
    redirect(`/${locale}`);
  }

  return (
    <DashboardShell
      role="vendor"
      locale={locale}
      title={isFr ? 'Coupons' : 'Coupons'}
      subtitle={isFr ? 'Créez et gérez vos codes promotionnels' : 'Create and manage your promotional codes'}
    >
      <VendorCouponsManager locale={locale} />
    </DashboardShell>
  );
}
