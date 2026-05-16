import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRequestHostFromHeaders } from '@/lib/http/request-host';
import { isAdminSubdomainHost } from '@/lib/routing/subdomains';
import { getUserRoleWithAdminFallback } from '@/lib/auth/admin-role';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const host = getRequestHostFromHeaders(headerStore);

  if (!isAdminSubdomainHost(host)) {
    return children;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);
  if (!roleLookup.resolved || roleLookup.role !== 'admin') {
    notFound();
  }

  return children;
}
