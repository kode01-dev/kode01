import { DashboardShell } from '@/features/dashboard';
import { ProductCreationStepper } from '@/features/dashboard/components/ProductCreationStepper';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';

export default async function NewProductPage(
  props: { params: Promise<{ locale: string }> }
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.vendor.product_creation');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_id')
    .eq('id', user.id)
    .single();

  if (!profile || !isSellerRole(profile.role)) {
    redirect(`/${locale}`);
  }

  // Vendor can create drafts without Stripe, but cannot publish
  const canPublish = isSellerRole(profile.role)
    && Boolean(profile.stripe_account_id)
    && profile.stripe_charges_enabled === true
    && profile.stripe_payouts_enabled === true;

  return (
    <DashboardShell
      role="vendor"
      locale={locale}
      title={t('page_title')}
      subtitle={t('page_subtitle')}
    >
      <ProductCreationStepper canPublish={canPublish} />
    </DashboardShell>
  );
}
