import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/features/dashboard';
import { isSellerRole } from '@/lib/auth/roles';
import { loadReviewHubData } from '@/features/reviews-hub/server/load-review-hub-data';
import { ReviewsHubPanel } from '@/features/reviews-hub/components/ReviewsHubPanel';

type VendorReviewsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ product?: string }>;
};

export default async function VendorReviewsPage({ params, searchParams }: VendorReviewsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialProductSlug = typeof resolvedSearchParams.product === 'string'
    ? resolvedSearchParams.product
    : null;
  const t = await getTranslations('dashboard.reviews');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isSellerRole(profile.role)) {
    redirect(`/${locale}`);
  }

  const entries = await loadReviewHubData(supabase, user.id);

  return (
    <DashboardShell role="vendor" locale={locale} title={t('title')} subtitle={t('subtitle')}>
      <ReviewsHubPanel entries={entries} initialProductSlug={initialProductSlug} />
    </DashboardShell>
  );
}

