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
import LegacyBuyerDashboardPage from '../../buyer/page';

export default async function ClientDashboardSlugPage({
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

  if (profile?.role !== 'buyer') {
    if (profile?.role === 'seller' && profile.slug) {
      redirect(buildDashboardVendorUrl(profile.slug, host, locale));
    }
    if (profile?.role === 'admin') {
      redirect(buildAdminDashboardUrl(host, locale));
    }
    if (onDashboardHost) {
      notFound();
    }
    redirect(`/${locale}`);
  }

  if (!profile.slug) {
    if (onDashboardHost) {
      redirect(buildMainSiteLocaleUrl(locale, host));
    }
    redirect(`/${locale}/buyer`);
  }

  if (profile.slug !== slug) {
    if (onDashboardHost) {
      redirect(buildDashboardClientUrl(profile.slug, host, locale));
    }
    redirect(`/${locale}/client/${profile.slug}`);
  }

  return <LegacyBuyerDashboardPage params={Promise.resolve({ locale })} />;
}
