import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleWithAdminFallback } from '@/lib/auth/admin-role';
import { AdminMfaPanel } from '@/features/admin/mfa/components/AdminMfaPanel';

function sanitizeReturnPath(candidate: string | null | undefined): string {
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('://')
  ) {
    return '/admin';
  }
  return candidate;
}

export default async function AdminMfaPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const returnPath = sanitizeReturnPath(searchParams.from);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);
  if (!roleLookup.resolved || roleLookup.role !== 'admin') {
    redirect(`/${locale}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      <AdminMfaPanel
        locale={locale}
        returnPath={returnPath}
        challengeMode="modal"
        autoRedirectOnVerified
      />
    </main>
  );
}
