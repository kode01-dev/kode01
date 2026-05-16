import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  buildAdminDashboardUrl,
  buildDashboardClientUrl,
  buildDashboardVendorUrl,
  buildMainSiteLocaleUrl,
  isDashboardSubdomainHost,
} from '@/lib/routing/subdomains';
import { normalizeProfileRole } from '@/lib/auth/roles';
import LegacyVendorDashboardPage from '../page';

export default async function VendorDashboardSlugPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const onDashboardHost = isDashboardSubdomainHost(host);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (onDashboardHost) {
      redirect(buildMainSiteLocaleUrl(locale, host));
    }
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, slug')
    .eq('id', user.id)
    .single();

  const normalizedRole = normalizeProfileRole(profile?.role);
  const vendorSlug = profile?.slug ?? null;

  if (normalizedRole !== 'seller') {
    if (normalizedRole === 'buyer' && vendorSlug) {
      redirect(buildDashboardClientUrl(vendorSlug, host, locale));
    }
    if (normalizedRole === 'admin') {
      redirect(buildAdminDashboardUrl(host, locale));
    }
    if (onDashboardHost) {
      notFound();
    }
    redirect(`/${locale}`);
  }

  if (!vendorSlug) {
    if (onDashboardHost) {
      redirect(buildMainSiteLocaleUrl(locale, host));
    }
    redirect(`/${locale}/vendor`);
  }

  if (vendorSlug !== slug) {
    if (onDashboardHost) {
      redirect(buildDashboardVendorUrl(vendorSlug, host, locale));
    }
    redirect(`/${locale}/vendor/${vendorSlug}`);
  }

  return <LegacyVendorDashboardPage params={Promise.resolve({ locale })} />;
}
