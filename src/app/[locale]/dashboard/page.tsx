import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  buildAdminDashboardUrl,
  buildDashboardClientUrl,
  buildDashboardVendorUrl,
  buildMainSiteLocaleUrl,
} from '@/lib/routing/subdomains';
import { normalizeProfileRole } from '@/lib/auth/roles';

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildMainSiteLocaleUrl(locale, host));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, slug')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect(buildMainSiteLocaleUrl(locale, host));
  }

  const normalizedRole = normalizeProfileRole(profile.role);

  if (normalizedRole === 'admin') {
    redirect(buildAdminDashboardUrl(host, locale));
  }

  if (!profile.slug) {
    if (normalizedRole === 'seller') {
      redirect(`/${locale}/vendor`);
    }
    redirect(`/${locale}/buyer`);
  }

  if (normalizedRole === 'seller') {
    redirect(buildDashboardVendorUrl(profile.slug, host, locale));
  }

  redirect(buildDashboardClientUrl(profile.slug, host, locale));
}
