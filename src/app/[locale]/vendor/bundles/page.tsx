import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';
import { VendorBundlesManager } from '@/features/bundles/components/VendorBundlesManager';

export default async function VendorBundlesPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.vendor');
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
      title={t('bundles_page.title')}
      subtitle={t('bundles_page.subtitle')}
    >
      <VendorBundlesManager locale={locale} />
    </DashboardShell>
  );
}
