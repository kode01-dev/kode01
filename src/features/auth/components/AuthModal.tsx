'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { X, Loader2, Eye, EyeOff, Mail, Lock, UserRound, Check, CalendarDays, CheckCircle2, ArrowLeft } from 'lucide-react';
import { loginSchema, passwordResetRequestSchema, signupSchema } from '../schemas';
import { loginAction, requestPasswordResetAction, signupAction } from '../actions/auth-actions';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginFormData, PasswordResetRequestFormData, SignupFormData } from '../schemas';
import { useBodyScrollLock } from '@/lib/ui/useBodyScrollLock';

const SIGNUP_CONFIRMATION_EMAIL_ERROR = 'SIGNUP_CONFIRMATION_EMAIL_ERROR';
const LOGIN_BANNED_ACCOUNT_ERROR = 'LOGIN_BANNED_ACCOUNT_ERROR';
const AUTH_PRELAUNCH_LOCKED_ERROR = 'AUTH_PRELAUNCH_LOCKED';
const AUTH_RATE_LIMITED_ERROR = 'RATE_LIMITED';

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

function usePasswordStrength(password: string) {
    return useMemo(() => {
        const checks = {
            minLength: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*]/.test(password),
        };
        const passed = Object.values(checks).filter(Boolean).length;
        const level = passed === 0 ? 0 : passed <= 2 ? 1 : passed <= 3 ? 2 : passed <= 4 ? 3 : 4;
        const labels = ['', 'very_weak', 'weak', 'good', 'strong'] as const;
        return { checks, passed, level, label: labels[level] };
    }, [password]);
}

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultTab?: AuthPrimaryTab;
}

type AuthPrimaryTab = 'login' | 'signup';
type AuthMode = AuthPrimaryTab | 'forgot-password';

type PrelaunchAccessCache = {
    loaded: boolean;
    enabled: boolean;
    unlocked: boolean;
};

const prelaunchAccessCache: PrelaunchAccessCache = {
    loaded: false,
    enabled: false,
    unlocked: true,
};

export function AuthModal({ isOpen, onClose, defaultTab = 'login' }: AuthModalProps) {
    const t = useTranslations('auth');
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { refreshAuth } = useAuth();
    const [activeTab, setActiveTab] = useState<AuthMode>(defaultTab);
    const [showPassword, setShowPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [signupSuccess, setSignupSuccess] = useState(false);
    const [loginSuccess, setLoginSuccess] = useState(false);
    const [passwordResetRequested, setPasswordResetRequested] = useState(false);
    const [prelaunchLoading, setPrelaunchLoading] = useState(!prelaunchAccessCache.loaded);
    const [prelaunchEnabled, setPrelaunchEnabled] = useState(prelaunchAccessCache.enabled);
    const [prelaunchUnlocked, setPrelaunchUnlocked] = useState(prelaunchAccessCache.unlocked);
    const [prelaunchPassword, setPrelaunchPassword] = useState('');
    const [prelaunchUnlocking, setPrelaunchUnlocking] = useState(false);
    const [prelaunchError, setPrelaunchError] = useState<string | null>(null);
    useBodyScrollLock(isOpen);
    const mfaReturnPath = useMemo(() => {
        const fromQuery = sanitizeReturnPath(searchParams?.get('next'));
        if (fromQuery !== '/admin') return fromQuery;

        const fromPathname = sanitizeReturnPath(pathname);
        if (fromPathname.startsWith('/admin')) return fromPathname;

        return '/admin';
    }, [pathname, searchParams]);

    // Login form
    const loginForm = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });

    // Signup form
    const signupForm = useForm<SignupFormData>({
        resolver: zodResolver(signupSchema),
        defaultValues: { email: '', password: '', displayName: '', dateOfBirth: '', acceptLegal: false },
    });

    const passwordResetForm = useForm<PasswordResetRequestFormData>({
        resolver: zodResolver(passwordResetRequestSchema),
        defaultValues: { email: '', locale: 'en' },
    });

    function handleClose() {
        setActiveTab(defaultTab);
        setServerError(null);
        setSignupSuccess(false);
        setLoginSuccess(false);
        setPasswordResetRequested(false);
        setShowPassword(false);
        setPrelaunchPassword('');
        setPrelaunchError(null);
        loginForm.reset();
        signupForm.reset();
        passwordResetForm.reset();
        onClose();
    }

    function handleTabChange(nextTab: AuthPrimaryTab) {
        if (nextTab === activeTab) return;
        setServerError(null);
        setShowPassword(false);
        setPasswordResetRequested(false);
        loginForm.reset();
        signupForm.reset();
        passwordResetForm.reset();
        setActiveTab(nextTab);
    }

    function handleForgotPasswordMode() {
        setServerError(null);
        setShowPassword(false);
        setPasswordResetRequested(false);
        passwordResetForm.reset();
        setActiveTab('forgot-password');
    }

    useEffect(() => {
        if (!isOpen) return;

        if (prelaunchAccessCache.loaded) {
            setPrelaunchEnabled(prelaunchAccessCache.enabled);
            setPrelaunchUnlocked(prelaunchAccessCache.unlocked);
            setPrelaunchLoading(false);
            return;
        }

        let isMounted = true;
        setPrelaunchLoading(true);
        setPrelaunchError(null);

        const loadPrelaunchAccess = async () => {
            try {
                const response = await fetch('/api/prelaunch/access', {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!response.ok) {
                    if (!isMounted) return;
                    setPrelaunchEnabled(false);
                    setPrelaunchUnlocked(true);
                    prelaunchAccessCache.loaded = true;
                    prelaunchAccessCache.enabled = false;
                    prelaunchAccessCache.unlocked = true;
                    return;
                }

                const data = await response.json();

                const enabled = data?.enabled === true;
                const unlocked = data?.unlocked === true;

                if (!isMounted) return;
                setPrelaunchEnabled(enabled);
                setPrelaunchUnlocked(unlocked);
                prelaunchAccessCache.loaded = true;
                prelaunchAccessCache.enabled = enabled;
                prelaunchAccessCache.unlocked = unlocked;
            } catch (error) {
                console.error('Failed to fetch prelaunch auth access state:', error);
                if (!isMounted) return;
                // Fail open on client if endpoint is temporarily unavailable.
                setPrelaunchEnabled(false);
                setPrelaunchUnlocked(true);
                prelaunchAccessCache.loaded = true;
                prelaunchAccessCache.enabled = false;
                prelaunchAccessCache.unlocked = true;
            } finally {
                if (isMounted) {
                    setPrelaunchLoading(false);
                }
            }
        };

        void loadPrelaunchAccess();

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    async function handlePrelaunchUnlock(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPrelaunchUnlocking(true);
        setPrelaunchError(null);

        try {
            const response = await fetch('/api/prelaunch/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: prelaunchPassword }),
            });

            if (!response.ok) {
                setPrelaunchError(
                    response.status === 429
                        ? t('prelaunch_error_rate_limited')
                        : t('prelaunch_error_invalid_password'),
                );
                return;
            }

            setPrelaunchUnlocked(true);
            prelaunchAccessCache.loaded = true;
            prelaunchAccessCache.enabled = true;
            prelaunchAccessCache.unlocked = true;
            setPrelaunchPassword('');
        } catch (error) {
            console.error('Failed to unlock prelaunch auth access:', error);
            setPrelaunchError(t('prelaunch_error_generic'));
        } finally {
            setPrelaunchUnlocking(false);
        }
    }

    async function handleLogin(data: LoginFormData) {
        setServerError(null);
        const result = await loginAction(data);
        if (result.error) {
            if (typeof result.error === 'string' && result.error === AUTH_PRELAUNCH_LOCKED_ERROR) {
                setPrelaunchEnabled(true);
                setPrelaunchUnlocked(false);
                prelaunchAccessCache.loaded = true;
                prelaunchAccessCache.enabled = true;
                prelaunchAccessCache.unlocked = false;
                setPrelaunchError(t('prelaunch_error_locked'));
                return;
            }
            if (typeof result.error === 'string' && result.error === LOGIN_BANNED_ACCOUNT_ERROR) {
                setServerError(t('error_banned_account'));
            } else if (typeof result.error === 'string' && result.error === AUTH_RATE_LIMITED_ERROR) {
                setServerError(t('error_rate_limited'));
            } else {
                setServerError(typeof result.error === 'string' ? result.error : t('error_invalid'));
            }
            return;
        }
        if ('mfaRequired' in result && result.mfaRequired) {
            await refreshAuth();
            handleClose();
            router.push(`/admin/mfa?from=${encodeURIComponent(mfaReturnPath)}`);
            return;
        }
        await refreshAuth();
        setLoginSuccess(true);
        setTimeout(() => {
            handleClose();
            router.refresh();
        }, 800);
    }

    const watchedPassword = useWatch({
        control: signupForm.control,
        name: 'password',
        defaultValue: '',
    });
    const strength = usePasswordStrength(watchedPassword);

    async function handleSignup(data: SignupFormData) {
        setServerError(null);
        const result = await signupAction(data);
        if (result.error) {
            if (typeof result.error === 'string' && result.error === AUTH_PRELAUNCH_LOCKED_ERROR) {
                setPrelaunchEnabled(true);
                setPrelaunchUnlocked(false);
                prelaunchAccessCache.loaded = true;
                prelaunchAccessCache.enabled = true;
                prelaunchAccessCache.unlocked = false;
                setPrelaunchError(t('prelaunch_error_locked'));
                return;
            }
            if (typeof result.error === 'string' && result.error === SIGNUP_CONFIRMATION_EMAIL_ERROR) {
                setServerError(t('error_confirmation_email_failed'));
            } else if (typeof result.error === 'string' && result.error === AUTH_RATE_LIMITED_ERROR) {
                setServerError(t('error_rate_limited'));
            } else {
                setServerError(typeof result.error === 'string' ? result.error : t('error_invalid'));
            }
            return;
        }
        setSignupSuccess(true);
    }

    async function handlePasswordResetRequest(data: PasswordResetRequestFormData) {
        setServerError(null);
        const normalizedLocale = locale === 'fr' ? 'fr' : 'en';
        const result = await requestPasswordResetAction({
            ...data,
            locale: normalizedLocale,
        });

        if (result.error) {
            if (typeof result.error === 'string' && result.error === AUTH_RATE_LIMITED_ERROR) {
                setServerError(t('reset_error_rate_limited'));
            } else {
                setServerError(typeof result.error === 'string' ? t('reset_error_generic') : t('reset_error_invalid'));
            }
            return;
        }

        setPasswordResetRequested(true);
        passwordResetForm.reset({ email: '', locale: normalizedLocale });
    }

    if (!isOpen) return null;

    const showPrelaunchGate = prelaunchEnabled && !prelaunchUnlocked;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-[440px] bg-white rounded-[24px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors cursor-pointer"
                >
                    <X size={16} className="text-kode01-noir" />
                </button>

                {/* Header */}
                <div className="px-8 pt-10 pb-6 text-center">
                    <h2 className="font-serif text-[1.75rem] font-bold text-kode01-noir leading-tight mb-2">
                        {showPrelaunchGate
                            ? t('prelaunch_title')
                            : activeTab === 'forgot-password'
                                ? t('reset_title')
                                : activeTab === 'login'
                                ? t('login_title')
                                : t('signup_title')}
                    </h2>
                    <p className="text-kode01-noir/50 text-sm font-sans">
                        {showPrelaunchGate
                            ? t('prelaunch_subtitle')
                            : activeTab === 'forgot-password'
                                ? t('reset_subtitle')
                                : activeTab === 'login'
                                ? t('login_subtitle')
                                : t('signup_subtitle')}
                    </p>
                </div>

                {/* Tab toggle */}
                {!prelaunchLoading && !showPrelaunchGate && activeTab !== 'forgot-password' && (
                    <div className="px-8 mb-6">
                        <div className="flex bg-kode01-noir/5 rounded-full p-1">
                            <button
                                onClick={() => handleTabChange('login')}
                                className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer ${activeTab === 'login'
                                    ? 'bg-kode01-noir text-white shadow-sm'
                                    : 'text-kode01-noir/50 hover:text-kode01-noir/70'
                                    }`}
                            >
                                {t('login_tab')}
                            </button>
                            <button
                                onClick={() => handleTabChange('signup')}
                                className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all cursor-pointer ${activeTab === 'signup'
                                    ? 'bg-kode01-noir text-white shadow-sm'
                                    : 'text-kode01-noir/50 hover:text-kode01-noir/70'
                                    }`}
                            >
                                {t('signup_tab')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Forms */}
                <div className="px-8 pb-8">
                    {prelaunchLoading ? (
                        <div className="py-8 flex items-center justify-center text-kode01-noir/60">
                            <Loader2 size={22} className="animate-spin" />
                        </div>
                    ) : showPrelaunchGate ? (
                        <form onSubmit={handlePrelaunchUnlock} className="flex flex-col gap-4">
                            <div className="relative">
                                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                <input
                                    type="password"
                                    value={prelaunchPassword}
                                    onChange={(event) => setPrelaunchPassword(event.target.value)}
                                    placeholder={t('prelaunch_password_placeholder')}
                                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    disabled={prelaunchUnlocking}
                                    required
                                />
                            </div>

                            {prelaunchError && (
                                <div className="bg-red-50 text-red-600 text-sm py-3 px-4 rounded-xl">
                                    {prelaunchError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={prelaunchUnlocking}
                                className="w-full py-3.5 bg-kode01-pink text-kode01-noir rounded-full font-bold text-sm hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {prelaunchUnlocking && <Loader2 size={18} className="animate-spin" />}
                                {t('prelaunch_unlock_btn')}
                            </button>
                        </form>
                    ) : activeTab === 'forgot-password' ? (
                        passwordResetRequested ? (
                            <div className="text-center py-6">
                                <div className="w-16 h-16 mx-auto mb-4 bg-kode01-pink/20 rounded-full flex items-center justify-center">
                                    <Mail size={28} className="text-kode01-pink" />
                                </div>
                                <h3 className="font-serif text-xl font-bold text-kode01-noir mb-2">
                                    {t('reset_success_title')}
                                </h3>
                                <p className="text-kode01-noir/50 text-sm leading-relaxed">
                                    {t('reset_success')}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange('login')}
                                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-kode01-noir/15 px-5 py-2.5 text-sm font-bold text-kode01-noir transition-colors hover:border-kode01-noir hover:bg-kode01-noir hover:text-white"
                                >
                                    <ArrowLeft size={16} />
                                    {t('reset_back_to_login')}
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={passwordResetForm.handleSubmit(handlePasswordResetRequest)} className="flex flex-col gap-4">
                                <div>
                                    <div className="relative">
                                        <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                        <input
                                            {...passwordResetForm.register('email')}
                                            type="email"
                                            placeholder={t('email_placeholder')}
                                            className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                        />
                                    </div>
                                    {passwordResetForm.formState.errors.email && (
                                        <p className="text-red-500 text-xs mt-1.5 pl-2">{passwordResetForm.formState.errors.email.message}</p>
                                    )}
                                </div>

                                {serverError && (
                                    <div className="bg-red-50 text-red-600 text-sm py-3 px-4 rounded-xl">
                                        {serverError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={passwordResetForm.formState.isSubmitting}
                                    className="w-full py-3.5 bg-kode01-pink text-kode01-noir rounded-full font-bold text-sm hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {passwordResetForm.formState.isSubmitting && <Loader2 size={18} className="animate-spin" />}
                                    {passwordResetForm.formState.isSubmitting ? t('reset_sending') : t('reset_send_btn')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleTabChange('login')}
                                    className="mx-auto inline-flex items-center justify-center gap-2 text-sm font-bold text-kode01-noir/55 transition-colors hover:text-kode01-noir"
                                >
                                    <ArrowLeft size={16} />
                                    {t('reset_back_to_login')}
                                </button>
                            </form>
                        )
                    ) : loginSuccess ? (
                        <div className="text-center py-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle2 size={28} className="text-green-600" />
                            </div>
                            <h3 className="font-serif text-xl font-bold text-kode01-noir mb-2">
                                {t('login_success_title')}
                            </h3>
                            <p className="text-kode01-noir/50 text-sm">
                                {t('login_success')}
                            </p>
                        </div>
                    ) : signupSuccess ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-kode01-pink/20 rounded-full flex items-center justify-center">
                                <Mail size={28} className="text-kode01-pink" />
                            </div>
                            <h3 className="font-serif text-xl font-bold text-kode01-noir mb-2">
                                {t('success_signup_title')}
                            </h3>
                            <p className="text-kode01-noir/50 text-sm">
                                {t('success_signup')}
                            </p>
                        </div>
                    ) : activeTab === 'login' ? (
                        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="flex flex-col gap-4">
                            {/* Email */}
                            <div>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                    <input
                                        {...loginForm.register('email')}
                                        type="email"
                                        placeholder={t('email_placeholder')}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    />
                                </div>
                                {loginForm.formState.errors.email && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{loginForm.formState.errors.email.message}</p>
                                )}
                            </div>

                            {/* Password */}
                            <div>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                    <input
                                        {...loginForm.register('password')}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder={t('password_placeholder')}
                                        className="w-full pl-11 pr-12 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-kode01-noir/30 hover:text-kode01-noir/60 transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {loginForm.formState.errors.password && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{loginForm.formState.errors.password.message}</p>
                                )}
                            </div>

                            <div className="-mt-1 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleForgotPasswordMode}
                                    className="text-xs font-bold text-kode01-noir/50 transition-colors hover:text-kode01-noir"
                                >
                                    {t('forgot_password')}
                                </button>
                            </div>

                            {/* Server error */}
                            {serverError && (
                                <div className="bg-red-50 text-red-600 text-sm py-3 px-4 rounded-xl">
                                    {serverError}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loginForm.formState.isSubmitting}
                                className="w-full py-3.5 bg-kode01-pink text-kode01-noir rounded-full font-bold text-sm hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {loginForm.formState.isSubmitting && <Loader2 size={18} className="animate-spin" />}
                                {t('login_btn')}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={signupForm.handleSubmit(handleSignup)} className="flex flex-col gap-4">
                            {/* Display Name */}
                            <div>
                                <div className="relative">
                                    <UserRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                    <input
                                        {...signupForm.register('displayName')}
                                        type="text"
                                        placeholder={t('display_name_placeholder')}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    />
                                </div>
                                {signupForm.formState.errors.displayName && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{signupForm.formState.errors.displayName.message}</p>
                                )}
                            </div>

                            {/* Email */}
                            <div>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                    <input
                                        {...signupForm.register('email')}
                                        type="email"
                                        placeholder={t('email_placeholder')}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    />
                                </div>
                                {signupForm.formState.errors.email && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{signupForm.formState.errors.email.message}</p>
                                )}
                            </div>

                            {/* Date of Birth */}
                            <div>
                                <label className="block text-xs font-bold text-kode01-noir/50 mb-1.5 pl-2">
                                    {t('dob_label')}
                                </label>
                                <div className="relative">
                                    <CalendarDays size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30 pointer-events-none" />
                                    <input
                                        {...signupForm.register('dateOfBirth')}
                                        type="date"
                                        max={new Date().toISOString().split('T')[0]}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent text-kode01-noir/70"
                                    />
                                </div>
                                {signupForm.formState.errors.dateOfBirth && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{signupForm.formState.errors.dateOfBirth.message}</p>
                                )}
                                <p className="text-kode01-noir/30 text-[11px] mt-1 pl-2">
                                    {t('dob_hint')}
                                </p>
                            </div>

                            {/* Password */}
                            <div>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/30" />
                                    <input
                                        {...signupForm.register('password')}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder={t('password_placeholder')}
                                        className="w-full pl-11 pr-12 py-3.5 rounded-2xl border-2 border-kode01-noir/10 focus:border-kode01-pink outline-none text-sm font-sans transition-colors bg-transparent"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-kode01-noir/30 hover:text-kode01-noir/60 transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {signupForm.formState.errors.password && (
                                    <p className="text-red-500 text-xs mt-1.5 pl-2">{signupForm.formState.errors.password.message}</p>
                                )}

                                {/* Password strength indicator */}
                                {watchedPassword.length > 0 && (
                                    <div className="mt-3 space-y-2.5">
                                        {/* Strength bar */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-1 flex-1">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div
                                                        key={i}
                                                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength.level
                                                            ? strength.level <= 1 ? 'bg-red-400'
                                                                : strength.level === 2 ? 'bg-orange-400'
                                                                    : strength.level === 3 ? 'bg-yellow-400'
                                                                        : 'bg-green-500'
                                                            : 'bg-kode01-noir/10'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                            <span className={`text-xs font-bold ${strength.level <= 1 ? 'text-red-400'
                                                : strength.level === 2 ? 'text-orange-400'
                                                    : strength.level === 3 ? 'text-yellow-500'
                                                        : 'text-green-500'
                                                }`}>
                                                {t(`strength_${strength.label}`)}
                                            </span>
                                        </div>

                                        {/* Checklist */}
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                            {([
                                                ['minLength', t('rule_min_length')],
                                                ['uppercase', t('rule_uppercase')],
                                                ['lowercase', t('rule_lowercase')],
                                                ['number', t('rule_number')],
                                                ['special', t('rule_special')],
                                            ] as const).map(([key, label]) => (
                                                <div key={key} className="flex items-center gap-1.5">
                                                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${strength.checks[key]
                                                        ? 'bg-green-500'
                                                        : 'bg-kode01-noir/10'
                                                        }`}>
                                                        {strength.checks[key] && <Check size={9} className="text-white" strokeWidth={3} />}
                                                    </div>
                                                    <span className={`text-[11px] ${strength.checks[key] ? 'text-kode01-noir/60' : 'text-kode01-noir/30'
                                                        }`}>
                                                        {label}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Server error */}
                            {serverError && (
                                <div className="bg-red-50 text-red-600 text-sm py-3 px-4 rounded-xl">
                                    {serverError}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="flex items-start gap-2.5 text-xs text-kode01-noir/70 leading-relaxed">
                                    <input
                                        {...signupForm.register('acceptLegal')}
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 rounded border-kode01-noir/20 text-kode01-pink focus:ring-kode01-pink/30"
                                    />
                                    <span>
                                        {t('accept_legal_prefix')}{' '}
                                        <Link href="/terms" className="underline hover:text-kode01-noir">
                                            {t('accept_legal_terms')}
                                        </Link>{' '}
                                        {t('accept_legal_and')}{' '}
                                        <Link href="/privacy" className="underline hover:text-kode01-noir">
                                            {t('accept_legal_privacy')}
                                        </Link>{' '}
                                        {t('accept_legal_suffix')}
                                    </span>
                                </label>
                                {signupForm.formState.errors.acceptLegal && (
                                    <p className="text-red-500 text-xs pl-2">{signupForm.formState.errors.acceptLegal.message}</p>
                                )}
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={signupForm.formState.isSubmitting}
                                className="w-full py-3.5 bg-kode01-pink text-kode01-noir rounded-full font-bold text-sm hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {signupForm.formState.isSubmitting && <Loader2 size={18} className="animate-spin" />}
                                {t('signup_btn')}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
