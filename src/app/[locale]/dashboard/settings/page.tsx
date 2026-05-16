import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { SettingsPageContent } from '@/features/dashboard/components/SettingsPageContent';

export default async function DashboardSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mfa?: string; from?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const mfaRequired = query.mfa === 'required';
  const mfaReturnPath = query.from;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, stripe_customer_id, display_name')
    .eq('id', user.id)
    .single();

  const dashboardRole = profile?.role === 'admin'
    ? 'admin'
    : profile?.role === 'seller'
      ? 'vendor'
      : 'buyer';

  const t = await getTranslations({ locale, namespace: 'settings' });

  return (
    <DashboardShell role={dashboardRole} locale={locale} title={t('title')} subtitle={t('eyebrow')}>
      <div className="max-w-[920px] pb-20">
        <section className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">{t('eyebrow')}</p>
          <p className="mt-4 text-kode01-noir/65 max-w-2xl">{t('description')}</p>
        </section>

        <SettingsPageContent
          locale={locale}
          initialDisplayName={profile?.display_name ?? ''}
          email={user.email ?? ''}
          isAdmin={dashboardRole === 'admin'}
          isSeller={dashboardRole === 'vendor'}
          mfaRequired={mfaRequired}
          mfaReturnPath={mfaReturnPath}
        />
      </div>
    </DashboardShell>
  );
}
