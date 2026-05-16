'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Shield, CreditCard, Check, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
    updateProfileAction,
    updateEmailAction,
    updatePasswordAction,
} from '@/features/auth/actions/auth-actions';
import { PortalButton } from '@/features/billing/components/PortalButton';
import { DeleteTrackingDataButton } from '@/app/[locale]/settings/DeleteTrackingDataButton';
import { ExportDataButton } from '@/app/[locale]/settings/ExportDataButton';
import { DeleteAccountButton } from '@/app/[locale]/settings/DeleteAccountButton';
import { AdminMfaPanel } from '@/features/admin/mfa/components/AdminMfaPanel';

interface SettingsPageContentProps {
    locale: string;
    initialDisplayName: string;
    email: string;
    isAdmin?: boolean;
    isSeller?: boolean;
    mfaRequired?: boolean;
    mfaReturnPath?: string;
}

type ActionResult = {
    error?: string;
    success?: boolean;
};

function getActionError(result: ActionResult) {
    if (typeof result?.error === 'string' && result.error.trim().length > 0) {
        return result.error;
    }
    return null;
}

export function SettingsPageContent({
    locale,
    initialDisplayName,
    email,
    isAdmin = false,
    isSeller = false,
    mfaRequired = false,
    mfaReturnPath,
}: SettingsPageContentProps) {
    const t = useTranslations('dashboard.settings_modal');
    const { refreshAuth } = useAuth();

    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [nextEmail, setNextEmail] = useState(email);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingEmail, setIsSavingEmail] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const previousName = displayName;
        setIsSavingProfile(true);

        try {
            const result = (await updateProfileAction({ displayName })) as ActionResult;
            const error = getActionError(result);
            if (error) {
                setDisplayName(previousName);
                toast.error(error);
                return;
            }
            toast.success(t('profile_update_success'));
            await refreshAuth();
        } catch {
            setDisplayName(previousName);
            toast.error(t('profile_update_error'));
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSavingEmail(true);

        try {
            const result = (await updateEmailAction({ email: nextEmail })) as ActionResult;
            const error = getActionError(result);
            if (error) {
                toast.error(error);
                return;
            }
            toast.success(t('email_update_success'));
        } catch {
            toast.error(t('email_update_error'));
        } finally {
            setIsSavingEmail(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSavingPassword(true);

        try {
            const result = (await updatePasswordAction({ password, confirmPassword })) as ActionResult;
            const error = getActionError(result);
            if (error) {
                toast.error(error);
                return;
            }
            setPassword('');
            setConfirmPassword('');
            toast.success(t('password_update_success'));
        } catch {
            toast.error(t('password_update_error'));
        } finally {
            setIsSavingPassword(false);
        }
    };

    const benefits = [
        t('billing_benefit_1'),
        t('billing_benefit_2'),
        t('billing_benefit_3'),
    ];
    const requiresMfaAction = (isAdmin || isSeller) && mfaRequired;
    const defaultTab = requiresMfaAction ? 'privacy' : 'profile';

    return (
        <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList>
                <TabsTrigger value="profile">
                    {t('profile_tab')}
                </TabsTrigger>
                <TabsTrigger value="billing">
                    {t('billing_tab')}
                </TabsTrigger>
                <TabsTrigger value="privacy">
                    {t('privacy_tab')}
                </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6 mt-6">
                {/* Display Name Card */}
                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardContent className="pt-6">
                        <form onSubmit={handleProfileSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="settings-display-name"
                                    className="block text-sm font-semibold text-kode01-noir/70"
                                >
                                    {t('display_name_label')}
                                </label>
                                <input
                                    id="settings-display-name"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder={t('display_name_placeholder')}
                                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                                    minLength={2}
                                    maxLength={50}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-kode01-noir/70">
                                    {t('email_label')}
                                </label>
                                <p className="text-sm text-kode01-noir/55">{email}</p>
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingProfile}
                                className="inline-flex items-center rounded-full bg-kode01-noir px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSavingProfile ? t('saving') : t('save_profile')}
                            </button>
                        </form>
                    </CardContent>
                </Card>

                {/* Email Change Card */}
                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                            {t('email_change_title')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/55">
                            {t('email_change_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleEmailSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="settings-new-email"
                                    className="block text-sm font-semibold text-kode01-noir/70"
                                >
                                    {t('new_email_label')}
                                </label>
                                <input
                                    id="settings-new-email"
                                    type="email"
                                    value={nextEmail}
                                    onChange={(e) => setNextEmail(e.target.value)}
                                    placeholder={t('new_email_placeholder')}
                                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingEmail}
                                className="inline-flex items-center rounded-full border border-kode01-noir/20 px-5 py-2.5 text-sm font-bold text-kode01-noir transition-colors hover:border-kode01-noir hover:bg-kode01-noir hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSavingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSavingEmail ? t('updating_email') : t('update_email')}
                            </button>
                        </form>
                    </CardContent>
                </Card>

                {/* Password Change Card */}
                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                            {t('password_change_title')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/55">
                            {t('password_change_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="settings-new-password"
                                    className="block text-sm font-semibold text-kode01-noir/70"
                                >
                                    {t('new_password_label')}
                                </label>
                                <input
                                    id="settings-new-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('new_password_placeholder')}
                                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label
                                    htmlFor="settings-confirm-password"
                                    className="block text-sm font-semibold text-kode01-noir/70"
                                >
                                    {t('confirm_new_password_label')}
                                </label>
                                <input
                                    id="settings-confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder={t('confirm_new_password_placeholder')}
                                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                                    autoComplete="new-password"
                                    minLength={8}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSavingPassword}
                                className="inline-flex items-center rounded-full border border-kode01-noir/20 px-5 py-2.5 text-sm font-bold text-kode01-noir transition-colors hover:border-kode01-noir hover:bg-kode01-noir hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isSavingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSavingPassword ? t('updating_password') : t('update_password')}
                            </button>
                        </form>
                    </CardContent>
                </Card>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-6 mt-6">
                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kode01-pink/10">
                                <CreditCard size={20} className="text-kode01-pink" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                                    {t('billing_status_title')}
                                </CardTitle>
                                <CardDescription className="text-kode01-noir/55">
                                    {t('billing_active_description')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <PortalButton
                            label={t('manage_subscription')}
                            loadingLabel={t('loading_portal')}
                            className="inline-flex items-center rounded-full bg-kode01-noir px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir disabled:cursor-not-allowed disabled:opacity-70"
                        />

                        <Separator className="bg-black/5" />

                        <div className="space-y-3">
                            {benefits.map((benefit, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-kode01-green/10">
                                        <Check size={14} className="text-kode01-green" />
                                    </div>
                                    <span className="text-sm font-medium text-kode01-noir/70">{benefit}</span>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-kode01-noir/40">
                            {t('billing_secure_disclaimer')}
                        </p>
                    </CardContent>
                </Card>
            </TabsContent>

            {/* Privacy Tab */}
            <TabsContent value="privacy" className="space-y-6 mt-6">
                {isAdmin || isSeller ? (
                    <section className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kode01-pink/10">
                                <KeyRound size={20} className="text-kode01-pink" />
                            </div>
                            <div>
                                <h3 className="text-lg font-serif font-black text-kode01-noir">
                                    {isAdmin ? t('admin_mfa_title') : 'Seller MFA'}
                                </h3>
                                <p className="text-sm text-kode01-noir/55">
                                    {isAdmin
                                        ? t('admin_mfa_description')
                                        : 'Enable MFA to access payout and seller financial actions.'}
                                </p>
                            </div>
                        </div>
                        <AdminMfaPanel
                            locale={locale}
                            returnPath={mfaReturnPath}
                            hideBackButton
                            challengeMode={mfaRequired ? 'modal' : 'inline'}
                            autoRedirectOnVerified={mfaRequired}
                        />
                    </section>
                ) : null}

                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kode01-blue/10">
                                <Shield size={20} className="text-kode01-blue" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                                    {t('tracking_title')}
                                </CardTitle>
                                <CardDescription className="text-kode01-noir/55">
                                    {t('tracking_description')}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DeleteTrackingDataButton />
                    </CardContent>
                </Card>

                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                            {t('export_title')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/55">
                            {t('export_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ExportDataButton />
                    </CardContent>
                </Card>

                <Card className="rounded-[24px] border-black/10 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-lg font-serif font-black text-kode01-noir">
                            {t('delete_account_title')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/55">
                            {t('delete_account_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DeleteAccountButton email={email} />
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
