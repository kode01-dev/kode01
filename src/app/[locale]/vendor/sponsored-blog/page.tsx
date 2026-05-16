import { redirect } from 'next/navigation';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { SponsoredBlogSubmissionPanel } from '@/features/editorial/components/SponsoredBlogSubmissionPanel';

type SponsoredSearchParams = {
  sponsored_checkout?: string;
};

function resolveCheckoutStatus(value: string | undefined): 'success' | 'cancel' | null {
  if (value === 'success') return 'success';
  if (value === 'cancel') return 'cancel';
  return null;
}

export default async function VendorSponsoredBlogPage(
  props: { params: Promise<{ locale: string }>; searchParams: Promise<SponsoredSearchParams> },
) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'seller') {
    redirect(`/${locale}/vendor`);
  }

  return (
    <DashboardShell
      role="vendor"
      locale={locale}
      title="Blog commandité"
      subtitle="Soumettez un article sponsorisé (paiement + validation admin)"
    >
      <SponsoredBlogSubmissionPanel
        locale={locale}
        role="seller"
        checkoutStatus={resolveCheckoutStatus(searchParams.sponsored_checkout)}
      />
    </DashboardShell>
  );
}
