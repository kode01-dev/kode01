'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    updateEmailAction,
    updatePasswordAction,
    updateProfileAction,
} from '@/features/auth/actions/auth-actions';

interface ProfileSettingsFormProps {
    initialDisplayName: string;
    email: string;
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

export function ProfileSettingsForm({ initialDisplayName, email }: ProfileSettingsFormProps) {
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [nextEmail, setNextEmail] = useState(email);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingEmail, setIsSavingEmail] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSavingProfile(true);

        try {
            const result = (await updateProfileAction({ displayName })) as ActionResult;
            const error = getActionError(result);
            if (error) {
                toast.error(error);
                return;
            }
            toast.success('Profile updated.');
        } catch (error) {
            console.error('Failed to update profile', error);
            toast.error('Unable to update profile right now.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSavingEmail(true);

        try {
            const result = (await updateEmailAction({ email: nextEmail })) as ActionResult;
            const error = getActionError(result);
            if (error) {
                toast.error(error);
                return;
            }
            toast.success('Confirmation sent to your new email.');
        } catch (error) {
            console.error('Failed to update email', error);
            toast.error('Unable to update email right now.');
        } finally {
            setIsSavingEmail(false);
        }
    };

    const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
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
            toast.success('Password updated.');
        } catch (error) {
            console.error('Failed to update password', error);
            toast.error('Unable to update password right now.');
        } finally {
            setIsSavingPassword(false);
        }
    };

    return (
        <div className="space-y-8">
            <form onSubmit={handleProfileSubmit} className="space-y-3">
                <h2 className="text-2xl font-serif font-black tracking-tight text-kode01-noir">Profile</h2>
                <label className="block text-sm font-semibold text-kode01-noir/70" htmlFor="display-name">
                    Display name
                </label>
                <input
                    id="display-name"
                    name="display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                    minLength={2}
                    maxLength={50}
                    required
                />
                <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="inline-flex items-center rounded-full bg-kode01-noir px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isSavingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSavingProfile ? 'Saving...' : 'Save profile'}
                </button>
            </form>

            <form onSubmit={handleEmailSubmit} className="space-y-3 border-t border-black/10 pt-8">
                <h2 className="text-2xl font-serif font-black tracking-tight text-kode01-noir">Email</h2>
                <label className="block text-sm font-semibold text-kode01-noir/70" htmlFor="email">
                    Sign-in email
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    value={nextEmail}
                    onChange={(event) => setNextEmail(event.target.value)}
                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                    required
                />
                <p className="text-xs text-kode01-noir/55">We will send a confirmation link to this address.</p>
                <button
                    type="submit"
                    disabled={isSavingEmail}
                    className="inline-flex items-center rounded-full border border-kode01-noir/20 px-5 py-2.5 text-sm font-bold text-kode01-noir transition-colors hover:border-kode01-noir hover:bg-kode01-noir hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isSavingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSavingEmail ? 'Saving...' : 'Update email'}
                </button>
            </form>

            <form onSubmit={handlePasswordSubmit} className="space-y-3 border-t border-black/10 pt-8">
                <h2 className="text-2xl font-serif font-black tracking-tight text-kode01-noir">Password</h2>
                <label className="block text-sm font-semibold text-kode01-noir/70" htmlFor="new-password">
                    New password
                </label>
                <input
                    id="new-password"
                    name="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                    autoComplete="new-password"
                    minLength={8}
                    required
                />
                <label className="block text-sm font-semibold text-kode01-noir/70" htmlFor="confirm-password">
                    Confirm password
                </label>
                <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-11 w-full rounded-xl border border-black/15 px-4 text-sm text-kode01-noir outline-none transition focus:border-kode01-pink"
                    autoComplete="new-password"
                    minLength={8}
                    required
                />
                <button
                    type="submit"
                    disabled={isSavingPassword}
                    className="inline-flex items-center rounded-full border border-kode01-noir/20 px-5 py-2.5 text-sm font-bold text-kode01-noir transition-colors hover:border-kode01-noir hover:bg-kode01-noir hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {isSavingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSavingPassword ? 'Saving...' : 'Update password'}
                </button>
            </form>
        </div>
    );
}
