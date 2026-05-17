'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/env/server';
import {
    accountEmailUpdateSchema,
    accountPasswordUpdateSchema,
    loginSchema,
    passwordResetRequestSchema,
    profileUpdateSchema,
    signupSchema,
} from '../schemas';
import type {
    AccountEmailUpdateFormData,
    AccountPasswordUpdateFormData,
    LoginFormData,
    PasswordResetRequestFormData,
    ProfileUpdateFormData,
    SignupFormData,
} from '../schemas';
import { LEGAL_ACCEPTANCE_VERSION } from '@/lib/legal';
import { headers } from 'next/headers';
import { getAuditContextFromHeaders, logAuditEvent } from '@/lib/security/audit';
import { getUserRoleWithAdminFallback } from '@/lib/auth/admin-role';
import { hasVerifiedMfaMethod, isAal2 } from '@/lib/auth/mfa';
import { getPrelaunchAuthAccessState } from '@/features/site-lockscreen/lib/lockscreen-server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { buildRateLimitKey } from '@/lib/security/rate-limit-request';
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip';
import { isBlockedBotUserAgent } from '@/lib/security/bot-detection';
import bcrypt from 'bcryptjs';

const SIGNUP_CONFIRMATION_EMAIL_ERROR = 'SIGNUP_CONFIRMATION_EMAIL_ERROR';
const LOGIN_BANNED_ACCOUNT_ERROR = 'LOGIN_BANNED_ACCOUNT_ERROR';
const AUTH_PRELAUNCH_LOCKED_ERROR = 'AUTH_PRELAUNCH_LOCKED';
const AUTH_RATE_LIMITED_ERROR = 'RATE_LIMITED';
const AUTH_BOT_BLOCKED_ERROR = 'BOT_BLOCKED';
const PASSWORD_RESET_SESSION_MISSING_ERROR = 'PASSWORD_RESET_SESSION_MISSING';
const PASSWORD_HISTORY_LIMIT = 5;
const PASSWORD_HISTORY_BCRYPT_ROUNDS = 12;
const PASSWORD_HISTORY_TRIM_BATCH_SIZE = 200;
const PASSWORD_HISTORY_TRIM_MAX_BATCHES = 20;
const PASSWORD_HISTORY_TRIM_MAX_STALE_ROWS =
    PASSWORD_HISTORY_TRIM_BATCH_SIZE * PASSWORD_HISTORY_TRIM_MAX_BATCHES;

type PasswordHistoryRow = {
    id: string;
    password_hash: string;
};

type PasswordHistoryIdRow = {
    id: string;
};

async function findReusedPasswordHistoryRow(
    candidatePassword: string,
    recentHistory: PasswordHistoryRow[],
): Promise<PasswordHistoryRow | null> {
    if (recentHistory.length === 0) {
        return null;
    }

    const [mostRecentRow, ...remainingRows] = recentHistory;
    if (await bcrypt.compare(candidatePassword, mostRecentRow.password_hash)) {
        return mostRecentRow;
    }

    if (remainingRows.length === 0) {
        return null;
    }

    const remainingChecks = await Promise.all(
        remainingRows.map((row) => bcrypt.compare(candidatePassword, row.password_hash)),
    );
    const reusedRowIndex = remainingChecks.findIndex((reused) => reused);
    return reusedRowIndex >= 0 ? remainingRows[reusedRowIndex] : null;
}

function getEmailRedirectTo() {
    try {
        return `${getAppBaseUrl()}/auth/confirm`;
    } catch {
        return undefined;
    }
}

function getPasswordResetRedirectTo(locale: 'en' | 'fr') {
    try {
        const redirectUrl = new URL(`/${locale}/auth/confirm`, getAppBaseUrl());
        redirectUrl.searchParams.set('next', `/${locale}/auth/reset-password`);
        return redirectUrl.toString();
    } catch {
        return undefined;
    }
}

function hashRateLimitIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function normalizeEmailForRateLimit(email: string): string {
    return email.trim().toLowerCase();
}

function buildEmailAuditMetadata(email: string) {
    const [localPart = '', domainPart = ''] = email.trim().toLowerCase().split('@');
    const localHint =
        localPart.length <= 2
            ? `${localPart}***`
            : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
    return {
        email_domain: domainPart || null,
        email_hint: domainPart ? `${localHint}@${domainPart}` : localHint,
    };
}

function getValidationErrorMessage(
    flattened: {
        fieldErrors: Record<string, string[] | undefined>;
        formErrors: string[];
    },
    fallback: string,
) {
    for (const messages of Object.values(flattened.fieldErrors)) {
        const firstMessage = messages?.[0];
        if (firstMessage) return firstMessage;
    }
    return flattened.formErrors[0] ?? fallback;
}

async function getRecentPasswordHistory(userId: string): Promise<PasswordHistoryRow[]> {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
        .from('auth_password_history')
        .select('id, password_hash')
        .eq('user_id', userId)
        .order('changed_at', { ascending: false })
        .limit(PASSWORD_HISTORY_LIMIT);

    if (error) {
        throw new Error(`Failed to load password history: ${error.message}`);
    }

    return (data ?? []) as PasswordHistoryRow[];
}

async function trimPasswordHistory(userId: string): Promise<void> {
    const adminSupabase = createAdminClient();

    const { data, error } = await adminSupabase
        .from('auth_password_history')
        .select('id')
        .eq('user_id', userId)
        .order('changed_at', { ascending: false })
        .range(
            PASSWORD_HISTORY_LIMIT,
            PASSWORD_HISTORY_LIMIT + PASSWORD_HISTORY_TRIM_MAX_STALE_ROWS - 1,
        );

    if (error) {
        throw new Error(`Failed to read stale password history rows: ${error.message}`);
    }

    const staleIds = ((data ?? []) as PasswordHistoryIdRow[])
        .map((row) => row.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (staleIds.length === 0) return;

    for (let index = 0; index < staleIds.length; index += PASSWORD_HISTORY_TRIM_BATCH_SIZE) {
        const staleIdBatch = staleIds.slice(index, index + PASSWORD_HISTORY_TRIM_BATCH_SIZE);
        const { error: deleteError } = await adminSupabase
            .from('auth_password_history')
            .delete()
            .in('id', staleIdBatch);

        if (deleteError) {
            throw new Error(`Failed to trim password history: ${deleteError.message}`);
        }
    }

    if (staleIds.length >= PASSWORD_HISTORY_TRIM_MAX_STALE_ROWS) {
        throw new Error('Password history trim exceeded safe iteration limit');
    }
}

async function recordPasswordHistory(userId: string, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_HISTORY_BCRYPT_ROUNDS);
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
        .from('auth_password_history')
        .insert({
            user_id: userId,
            password_hash: passwordHash,
        });

    if (error) {
        throw new Error(`Failed to insert password history: ${error.message}`);
    }

    await trimPasswordHistory(userId);
}

type AuthRateLimitIdentity =
    | { kind: 'email'; value: string }
    | { kind: 'user'; value: string };

function buildAuthActionRateLimitKey(
    requestHeaders: Awaited<ReturnType<typeof headers>>,
    action: 'LOGIN' | 'SIGNUP' | 'PASSWORD_CHANGE' | 'PASSWORD_RESET',
    identity: AuthRateLimitIdentity,
): string {
    const parts = ['rate-limit', action];

    if (identity.kind === 'email') {
        parts.push('email', hashRateLimitIdentifier(normalizeEmailForRateLimit(identity.value)));
        const requesterIp = getTrustedClientIpFromHeaders(requestHeaders);
        if (requesterIp) {
            parts.push('ip', requesterIp);
        }
    } else {
        parts.push('user', identity.value);
    }

    return buildRateLimitKey(parts);
}

async function enforceAuthActionRateLimit(
    requestHeaders: Awaited<ReturnType<typeof headers>>,
    action: 'LOGIN' | 'SIGNUP' | 'PASSWORD_CHANGE' | 'PASSWORD_RESET',
    identity: AuthRateLimitIdentity,
): Promise<boolean> {
    const key = buildAuthActionRateLimitKey(requestHeaders, action, identity);
    const result = await checkRateLimit({ action, key });
    return result.allowed;
}

export async function loginAction(data: LoginFormData) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/auth/login');

    if (isBlockedBotUserAgent(requestHeaders.get('user-agent'))) {
        await logAuditEvent({
            eventType: 'auth.login.failed.bot_blocked',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
        });
        return { error: AUTH_BOT_BLOCKED_ERROR };
    }

    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
        await logAuditEvent({
            eventType: 'auth.login.failed.validation',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'schema_validation_failed',
            },
        });
        return { error: parsed.error.flatten().fieldErrors };
    }

    const email = normalizeEmailForRateLimit(parsed.data.email);

    if (!(await enforceAuthActionRateLimit(requestHeaders, 'LOGIN', { kind: 'email', value: email }))) {
        await logAuditEvent({
            eventType: 'auth.login.failed.rate_limited',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: buildEmailAuditMetadata(email),
        });
        return { error: AUTH_RATE_LIMITED_ERROR };
    }

    const prelaunchAccess = await getPrelaunchAuthAccessState();
    if (prelaunchAccess.enabled && prelaunchAccess.locked) {
        await logAuditEvent({
            eventType: 'auth.login.failed.error',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: AUTH_PRELAUNCH_LOCKED_ERROR,
            },
        });
        return { error: AUTH_PRELAUNCH_LOCKED_ERROR };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
    });

    if (error) {
        const normalizedMessage = error.message.toLowerCase();
        const isBannedAccount = normalizedMessage.includes('banned');
        await logAuditEvent({
            eventType: isBannedAccount
                ? 'auth.login.failed.banned_account'
                : normalizedMessage.includes('invalid login credentials')
                    ? 'auth.login.failed.invalid_credentials'
                    : 'auth.login.failed.error',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                error_message: error.message,
                ...buildEmailAuditMetadata(email),
            },
        });
        if (isBannedAccount) {
            return { error: LOGIN_BANNED_ACCOUNT_ERROR };
        }
        return { error: error.message };
    }

    const {
        data: { user },
    } = await supabase.auth.getUser();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    let requiresAdminMfaChallenge = false;

    if (user?.id) {
        const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);

        if (roleLookup.resolved && roleLookup.role === 'admin') {
            if (!session?.access_token) {
                requiresAdminMfaChallenge = true;
            } else {
                const { data: assurance, error: assuranceError } =
                    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);

                const mfaVerified =
                    !assuranceError &&
                    Boolean(assurance) &&
                    (
                        isAal2(assurance.currentLevel) ||
                        hasVerifiedMfaMethod(assurance.currentAuthenticationMethods)
                    );

                requiresAdminMfaChallenge = !mfaVerified;
            }
        }
    }

    await logAuditEvent({
        eventType: 'auth.login.success',
        userId: user?.id ?? null,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
            ...buildEmailAuditMetadata(email),
            mfa_required: requiresAdminMfaChallenge,
        },
    });

    if (requiresAdminMfaChallenge) {
        return { success: true, mfaRequired: true as const };
    }

    return { success: true };
}

export async function signupAction(data: SignupFormData) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/auth/signup');

    if (isBlockedBotUserAgent(requestHeaders.get('user-agent'))) {
        await logAuditEvent({
            eventType: 'auth.signup.failed.bot_blocked',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
        });
        return { error: AUTH_BOT_BLOCKED_ERROR };
    }

    const parsed = signupSchema.safeParse(data);
    if (!parsed.success) {
        await logAuditEvent({
            eventType: 'auth.signup.failed.validation',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'schema_validation_failed',
            },
        });
        return { error: parsed.error.flatten().fieldErrors };
    }

    const email = normalizeEmailForRateLimit(parsed.data.email);

    if (!(await enforceAuthActionRateLimit(requestHeaders, 'SIGNUP', { kind: 'email', value: email }))) {
        await logAuditEvent({
            eventType: 'auth.signup.failed.rate_limited',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: buildEmailAuditMetadata(email),
        });
        return { error: AUTH_RATE_LIMITED_ERROR };
    }

    const prelaunchAccess = await getPrelaunchAuthAccessState();
    if (prelaunchAccess.enabled && prelaunchAccess.locked) {
        await logAuditEvent({
            eventType: 'auth.signup.failed.error',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: AUTH_PRELAUNCH_LOCKED_ERROR,
            },
        });
        return { error: AUTH_PRELAUNCH_LOCKED_ERROR };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
        email,
        password: parsed.data.password,
        options: {
            emailRedirectTo: getEmailRedirectTo(),
            data: {
                display_name: parsed.data.displayName,
                date_of_birth: parsed.data.dateOfBirth,
                legal_acceptance_version: LEGAL_ACCEPTANCE_VERSION,
                legal_accepted_at: new Date().toISOString(),
            },
        },
    });

    if (error) {
        await logAuditEvent({
            eventType: /confirmation email/i.test(error.message)
                ? 'auth.signup.failed.confirmation_email'
                : 'auth.signup.failed.error',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                error_message: error.message,
                ...buildEmailAuditMetadata(email),
            },
        });
        if (/confirmation email/i.test(error.message)) {
            console.error('Supabase signup failed: confirmation email could not be sent.', error);
            return { error: SIGNUP_CONFIRMATION_EMAIL_ERROR };
        }
        return { error: error.message };
    }

    await logAuditEvent({
        eventType: 'auth.signup.success',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: buildEmailAuditMetadata(email),
    });

    return { success: true };
}

export async function requestPasswordResetAction(data: PasswordResetRequestFormData) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/auth/password-reset');

    if (isBlockedBotUserAgent(requestHeaders.get('user-agent'))) {
        await logAuditEvent({
            eventType: 'auth.password_reset.request.failed.bot_blocked',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
        });
        return { error: AUTH_BOT_BLOCKED_ERROR };
    }

    const parsed = passwordResetRequestSchema.safeParse(data);
    if (!parsed.success) {
        await logAuditEvent({
            eventType: 'auth.password_reset.request.failed.validation',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'schema_validation_failed',
            },
        });
        return { error: parsed.error.flatten().fieldErrors };
    }

    const email = normalizeEmailForRateLimit(parsed.data.email);
    if (!(await enforceAuthActionRateLimit(requestHeaders, 'PASSWORD_RESET', { kind: 'email', value: email }))) {
        await logAuditEvent({
            eventType: 'auth.password_reset.request.rate_limited',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: buildEmailAuditMetadata(email),
        });
        return { error: AUTH_RATE_LIMITED_ERROR };
    }

    const supabase = await createClient();
    const resetLocale = parsed.data.locale ?? 'en';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectTo(resetLocale),
    });

    if (error) {
        await logAuditEvent({
            eventType: 'auth.password_reset.request.failed',
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                error_message: error.message,
                ...buildEmailAuditMetadata(email),
            },
        });
        return { success: true };
    }

    await logAuditEvent({
        eventType: 'auth.password_reset.requested',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: buildEmailAuditMetadata(email),
    });

    return { success: true };
}

export async function logoutAction() {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/auth/logout');
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.auth.signOut();

    await logAuditEvent({
        eventType: error ? 'auth.logout.failed' : 'auth.logout.success',
        userId: user?.id ?? null,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: error ? { error_message: error.message } : undefined,
    });

    if (!error) {
        await logAuditEvent({
            eventType: 'auth.session.revoked',
            userId: user?.id ?? null,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'voluntary_logout',
            },
        });
    }

    return { success: true };
}

export async function updateProfileAction(data: ProfileUpdateFormData) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/dashboard/settings');
    const parsed = profileUpdateSchema.safeParse(data);
    if (!parsed.success) {
        return {
            error: getValidationErrorMessage(parsed.error.flatten(), 'Invalid profile data'),
        };
    }

    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized' };
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            display_name: parsed.data.displayName,
        })
        .eq('id', user.id);

    if (error) {
        await logAuditEvent({
            eventType: 'auth.profile.update.failed',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: { error_message: error.message },
        });
        return { error: error.message };
    }

    await logAuditEvent({
        eventType: 'auth.profile.update.success',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
    });

    try {
        const { revalidateTag } = await import('next/cache');
        const { PUBLIC_CACHE_TAGS } = await import('@/lib/cache/tags');
        revalidateTag(PUBLIC_CACHE_TAGS.market, 'default');
        revalidateTag(PUBLIC_CACHE_TAGS.creators, 'default');
    } catch (e) {
        console.error('Failed to revalidate cache tags after profile update', e);
    }

    return { success: true };
}

export async function updateEmailAction(data: AccountEmailUpdateFormData) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, '/dashboard/settings');
    const parsed = accountEmailUpdateSchema.safeParse(data);
    if (!parsed.success) {
        return {
            error: getValidationErrorMessage(parsed.error.flatten(), 'Invalid email address'),
        };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized' };
    }

    const currentEmail = user.email?.trim().toLowerCase() ?? '';
    if (currentEmail && currentEmail === parsed.data.email) {
        return { error: 'Your new email must be different from your current email.' };
    }

    const { error } = await supabase.auth.updateUser(
        { email: parsed.data.email },
        { emailRedirectTo: getEmailRedirectTo() },
    );

    if (error) {
        await logAuditEvent({
            eventType: 'auth.email.update.failed',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                error_message: error.message,
                ...buildEmailAuditMetadata(parsed.data.email),
            },
        });
        return { error: error.message };
    }

    await logAuditEvent({
        eventType: 'auth.email.update.requested',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: buildEmailAuditMetadata(parsed.data.email),
    });

    return { success: true };
}

type PasswordUpdateFlow = 'account_settings' | 'password_reset';

type PasswordUpdateOptions = {
    path: string;
    rateLimitAction: 'PASSWORD_CHANGE' | 'PASSWORD_RESET';
    eventPrefix: 'auth.password.update' | 'auth.password_reset.complete';
    flow: PasswordUpdateFlow;
    unauthorizedError: string;
};

async function updatePasswordWithPolicy(
    data: AccountPasswordUpdateFormData,
    options: PasswordUpdateOptions,
) {
    const requestHeaders = await headers();
    const auditContext = getAuditContextFromHeaders(requestHeaders, options.path);

    const parsed = accountPasswordUpdateSchema.safeParse(data);
    if (!parsed.success) {
        return {
            error: getValidationErrorMessage(parsed.error.flatten(), 'Invalid password'),
        };
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        await logAuditEvent({
            eventType: `${options.eventPrefix}.failed`,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'auth_session_missing',
                flow: options.flow,
            },
        });
        return { error: options.unauthorizedError };
    }

    if (!(await enforceAuthActionRateLimit(requestHeaders, options.rateLimitAction, { kind: 'user', value: user.id }))) {
        await logAuditEvent({
            eventType: `${options.eventPrefix}.rate_limited`,
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                flow: options.flow,
            },
        });
        return { error: AUTH_RATE_LIMITED_ERROR };
    }

    const candidatePassword = parsed.data.password;

    try {
        const recentHistory = await getRecentPasswordHistory(user.id);
        const reusedRow = await findReusedPasswordHistoryRow(candidatePassword, recentHistory);

        if (reusedRow) {
            await logAuditEvent({
                eventType: 'auth.password.history.rejected',
                userId: user.id,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: {
                    reason: 'reused_recent_password',
                    history_limit: PASSWORD_HISTORY_LIMIT,
                    history_entry_id: reusedRow.id,
                    flow: options.flow,
                },
            });
            return { error: `You cannot reuse one of your last ${PASSWORD_HISTORY_LIMIT} passwords.` };
        }
    } catch (historyReadError) {
        const errorMessage =
            historyReadError instanceof Error ? historyReadError.message : String(historyReadError);
        await logAuditEvent({
            eventType: `${options.eventPrefix}.failed`,
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                reason: 'password_history_read_failed',
                error_message: errorMessage,
                flow: options.flow,
            },
        });
        return { error: 'Unable to validate password history right now. Please try again.' };
    }

    const { error } = await supabase.auth.updateUser({
        password: candidatePassword,
    });

    if (error) {
        await logAuditEvent({
            eventType: `${options.eventPrefix}.failed`,
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: { error_message: error.message, flow: options.flow },
        });
        return { error: error.message };
    }

    try {
        await recordPasswordHistory(user.id, candidatePassword);
        await logAuditEvent({
            eventType: 'auth.password.history.updated',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                history_limit: PASSWORD_HISTORY_LIMIT,
                flow: options.flow,
            },
        });
    } catch (historyWriteError) {
        const errorMessage =
            historyWriteError instanceof Error ? historyWriteError.message : String(historyWriteError);
        await logAuditEvent({
            eventType: 'auth.password.history.update_failed',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: { error_message: errorMessage, flow: options.flow },
        });
    }

    await logAuditEvent({
        eventType: `${options.eventPrefix}.success`,
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
            flow: options.flow,
        },
    });

    return { success: true };
}

export async function updatePasswordAction(data: AccountPasswordUpdateFormData) {
    return updatePasswordWithPolicy(data, {
        path: '/dashboard/settings',
        rateLimitAction: 'PASSWORD_CHANGE',
        eventPrefix: 'auth.password.update',
        flow: 'account_settings',
        unauthorizedError: 'Unauthorized',
    });
}

export async function completePasswordResetAction(data: AccountPasswordUpdateFormData) {
    return updatePasswordWithPolicy(data, {
        path: '/auth/reset-password',
        rateLimitAction: 'PASSWORD_RESET',
        eventPrefix: 'auth.password_reset.complete',
        flow: 'password_reset',
        unauthorizedError: PASSWORD_RESET_SESSION_MISSING_ERROR,
    });
}
