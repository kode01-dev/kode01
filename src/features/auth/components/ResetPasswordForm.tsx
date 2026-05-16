'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/contexts/AuthContext';
import { accountPasswordUpdateSchema, type AccountPasswordUpdateFormData } from '../schemas';
import { completePasswordResetAction } from '../actions/auth-actions';

const AUTH_RATE_LIMITED_ERROR = 'RATE_LIMITED';
const PASSWORD_RESET_SESSION_MISSING_ERROR = 'PASSWORD_RESET_SESSION_MISSING';

type ActionResult = {
    error?: string | Record<string, string[] | undefined>;
    success?: boolean;
};

function getActionError(result: ActionResult) {
    if (typeof result?.error === 'string' && result.error.trim().length > 0) {
        return result.error;
    }
    return null;
}

export function ResetPasswordForm() {
    const t = useTranslations('auth.reset_password_page');
    const router = useRouter();
    const { refreshAuth } = useAuth();
    const [serverError, setServerError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const form = useForm<AccountPasswordUpdateFormData>({
        resolver: zodResolver(accountPasswordUpdateSchema),
        defaultValues: {
            password: '',
            confirmPassword: '',
        },
    });

    async function handleSubmit(data: AccountPasswordUpdateFormData) {
        setServerError(null);

        try {
            const result = (await completePasswordResetAction(data)) as ActionResult;
            const error = getActionError(result);

            if (error) {
                if (error === AUTH_RATE_LIMITED_ERROR) {
                    setServerError(t('error_rate_limited'));
                } else if (error === PASSWORD_RESET_SESSION_MISSING_ERROR) {
                    setServerError(t('error_session_missing'));
                } else {
                    setServerError(error);
                }
                return;
            }

            form.reset();
            await refreshAuth();
            setSuccess(true);
            router.refresh();
        } catch (error) {
            console.error('Failed to complete password reset', error);
            setServerError(t('error_generic'));
        }
    }

    if (success) {
        return (
            <div className="space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div className="space-y-3">
                    <h1 className="font-serif text-4xl font-black tracking-tight text-kode01-noir">
                        {t('success_title')}
                    </h1>
                    <p className="mx-auto max-w-xl text-base leading-relaxed text-kode01-noir/65">
                        {t('success_description')}
                    </p>
                </div>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
                >
                    {t('success_cta')}
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            <div className="space-y-2">
                <label
                    htmlFor="reset-password"
                    className="block text-sm font-semibold text-kode01-noir/70"
                >
                    {t('new_password_label')}
                </label>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-kode01-noir/30" />
                    <input
                        {...form.register('password')}
                        id="reset-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="h-12 w-full rounded-2xl border-2 border-kode01-noir/10 bg-transparent px-11 pr-12 text-sm text-kode01-noir outline-none transition-colors focus:border-kode01-pink"
                        placeholder={t('new_password_placeholder')}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-kode01-noir/30 transition-colors hover:text-kode01-noir/60"
                        aria-label={showPassword ? t('hide_password') : t('show_password')}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                {form.formState.errors.password && (
                    <p className="pl-2 text-xs text-red-500">{form.formState.errors.password.message}</p>
                )}
            </div>

            <div className="space-y-2">
                <label
                    htmlFor="reset-confirm-password"
                    className="block text-sm font-semibold text-kode01-noir/70"
                >
                    {t('confirm_password_label')}
                </label>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-kode01-noir/30" />
                    <input
                        {...form.register('confirmPassword')}
                        id="reset-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="h-12 w-full rounded-2xl border-2 border-kode01-noir/10 bg-transparent px-11 text-sm text-kode01-noir outline-none transition-colors focus:border-kode01-pink"
                        placeholder={t('confirm_password_placeholder')}
                    />
                </div>
                {form.formState.errors.confirmPassword && (
                    <p className="pl-2 text-xs text-red-500">{form.formState.errors.confirmPassword.message}</p>
                )}
            </div>

            {serverError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    {serverError}
                </div>
            )}

            <button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-kode01-pink px-6 py-3.5 text-sm font-bold text-kode01-noir transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.formState.isSubmitting ? t('submitting') : t('submit')}
            </button>
        </form>
    );
}
