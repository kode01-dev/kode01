import { headers } from 'next/headers';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { Link } from '@/i18n/routing';
import { getAuditContextFromHeaders, logAuditEvent } from '@/lib/security/audit';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';

function getResetErrorReason(status?: string, reason?: string) {
  if (status === 'error') {
    return reason ?? 'verification_failed';
  }
  return null;
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; reason?: string }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const resetErrorReason = getResetErrorReason(
    resolvedSearchParams.status,
    resolvedSearchParams.reason,
  );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canResetPassword = Boolean(user) && !resetErrorReason;
  const t = await getTranslations({ locale, namespace: 'auth.reset_password_page' });

  if (!canResetPassword) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/auth/reset-password');
    await logAuditEvent({
      eventType: 'auth.password_reset.link.invalid_or_expired',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        reason: resetErrorReason ?? 'auth_session_missing',
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-kode01-cream font-sans text-kode01-noir antialiased">
      <BaseHeader />

      <main className="flex-1 px-6 pb-24 pt-32 md:px-12">
        <section className="mx-auto w-full max-w-[620px] rounded-[28px] border border-black/10 bg-white p-8 shadow-sm md:p-12">
          {canResetPassword ? (
            <div className="space-y-8">
              <div className="space-y-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-kode01-noir/45">
                  {t('eyebrow')}
                </p>
                <h1 className="font-serif text-4xl font-black tracking-tight text-kode01-noir md:text-5xl">
                  {t('title')}
                </h1>
                <p className="mx-auto max-w-xl text-base leading-relaxed text-kode01-noir/65">
                  {t('description')}
                </p>
              </div>

              <ResetPasswordForm />
            </div>
          ) : (
            <div className="space-y-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-kode01-pink/10">
                <AlertTriangle className="h-8 w-8 text-kode01-pink" />
              </div>
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-kode01-noir/45">
                  {t('error_eyebrow')}
                </p>
                <h1 className="font-serif text-4xl font-black tracking-tight text-kode01-noir md:text-5xl">
                  {t('error_title')}
                </h1>
                <p className="mx-auto max-w-xl text-base leading-relaxed text-kode01-noir/65">
                  {t('error_description')}
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('error_cta')}
              </Link>
            </div>
          )}
        </section>
      </main>

      <BaseFooter />
    </div>
  );
}
