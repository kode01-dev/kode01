'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { hasVerifiedMfaMethod, isAal2 } from '@/lib/auth/mfa';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type MfaFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name: string | null;
  created_at: string | null;
};

type PendingTotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string | null;
};

type MfaStateResponse = {
  currentLevel: string | null;
  currentAuthenticationMethods: unknown;
  factors: MfaFactor[];
};

type MfaEnrollResponse = {
  factorId: string;
  qrCode: string;
  secret: string | null;
};

type MfaApiErrorResponse = {
  error?: string;
};

function getSafeDateLabel(value: string | null, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(locale);
}

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

function normalizeMfaQrCodeSource(rawQrCode: string): string {
  const trimmed = rawQrCode.trimEnd();

  if (trimmed.startsWith('data:image/svg+xml')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex < 0) return trimmed;

    const prefix = trimmed.slice(0, commaIndex);
    const payload = trimmed.slice(commaIndex + 1);

    let decodedPayload = payload;
    try {
      decodedPayload = decodeURIComponent(payload);
    } catch {
      decodedPayload = payload;
    }

    return `${prefix},${encodeURIComponent(decodedPayload.trimEnd())}`;
  }

  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;utf-8,${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

function getMfaApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const { error } = payload as MfaApiErrorResponse;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return fallback;
}

async function requestAdminMfaApi<T>(
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch('/api/admin/mfa', {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getMfaApiErrorMessage(payload, fallbackErrorMessage));
  }

  return payload as T;
}

interface AdminMfaPanelProps {
  locale: string;
  returnPath?: string;
  hideBackButton?: boolean;
  challengeMode?: 'inline' | 'modal';
  autoRedirectOnVerified?: boolean;
}

export function AdminMfaPanel({
  locale,
  returnPath,
  hideBackButton = false,
  challengeMode = 'inline',
  autoRedirectOnVerified = false,
}: AdminMfaPanelProps) {
  const t = useTranslations('dashboard.admin.mfa');
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const safeReturnPath = useMemo(() => sanitizeReturnPath(returnPath), [returnPath]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionMfaVerified, setSessionMfaVerified] = useState(false);
  const [currentAal, setCurrentAal] = useState<string | null>(null);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingTotpEnrollment | null>(null);
  const [enrollmentName, setEnrollmentName] = useState('Admin authenticator');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeFactorId, setChallengeFactorId] = useState<string | null>(null);
  const [challengeCode, setChallengeCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemovingFactorId, setIsRemovingFactorId] = useState<string | null>(null);
  const [hasAutoRedirected, setHasAutoRedirected] = useState(false);

  const verifiedFactors = useMemo(
    () => factors.filter((factor) => factor.status === 'verified'),
    [factors],
  );

  const isMfaEnforced = sessionMfaVerified && verifiedFactors.length > 0;
  const showInlineSessionChallenge =
    challengeMode === 'inline' && !isMfaEnforced && verifiedFactors.length > 0;
  const showModalSessionChallenge =
    challengeMode === 'modal' && !sessionMfaVerified && verifiedFactors.length > 0;

  const refreshMfaState = useCallback(
    async (showSuccessToast = false) => {
      const state = await requestAdminMfaApi<MfaStateResponse>(
        { method: 'GET' },
        t('messages.load_failed'),
      );

      const methods = state.currentAuthenticationMethods ?? [];
      const nextFactors = Array.isArray(state.factors) ? state.factors : [];
      const nextVerifiedFactors = nextFactors.filter((factor) => factor.status === 'verified');

      setFactors(nextFactors);
      setCurrentAal(state.currentLevel ?? null);
      setSessionMfaVerified(
        isAal2(state.currentLevel) || hasVerifiedMfaMethod(methods),
      );
      setChallengeFactorId((currentId) => {
        if (currentId && nextVerifiedFactors.some((factor) => factor.id === currentId)) {
          return currentId;
        }
        return nextVerifiedFactors[0]?.id ?? null;
      });

      if (showSuccessToast) {
        toast.success(t('messages.status_refreshed'));
      }
    },
    [t],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await refreshMfaState();
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : t('messages.load_failed');
        toast.error(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [refreshMfaState, t]);

  useEffect(() => {
    if (!autoRedirectOnVerified || hasAutoRedirected) return;
    if (!sessionMfaVerified) return;
    setHasAutoRedirected(true);
    void (async () => {
      await refreshAuth();
      router.replace(safeReturnPath);
      router.refresh();
    })();
  }, [
    autoRedirectOnVerified,
    hasAutoRedirected,
    refreshAuth,
    router,
    safeReturnPath,
    sessionMfaVerified,
  ]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshMfaState(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('messages.load_failed');
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleEnrollTotp() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const friendlyName = enrollmentName.trim() || 'Admin authenticator';
      const payload = await requestAdminMfaApi<MfaEnrollResponse>(
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'enroll',
            friendlyName,
          }),
        },
        t('messages.enroll_failed'),
      );

      if (!payload.factorId || !payload.qrCode) {
        throw new Error(t('messages.enroll_failed'));
      }

      setPendingEnrollment({
        factorId: payload.factorId,
        qrCode: normalizeMfaQrCodeSource(payload.qrCode),
        secret: payload.secret ?? null,
      });
      setVerificationCode('');
      toast.success(t('messages.enroll_started'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('messages.enroll_failed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEnrollment() {
    if (!pendingEnrollment || isSubmitting) return;
    if (!verificationCode.trim()) {
      toast.error(t('messages.code_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      await requestAdminMfaApi(
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'verify',
            factorId: pendingEnrollment.factorId,
            code: verificationCode.trim(),
          }),
        },
        t('messages.verify_failed'),
      );

      setPendingEnrollment(null);
      setVerificationCode('');
      await refreshMfaState();
      toast.success(t('messages.verify_success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('messages.verify_failed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSessionChallenge() {
    if (!challengeFactorId || isSubmitting) return;
    if (!challengeCode.trim()) {
      toast.error(t('messages.code_required'));
      return;
    }

    setIsSubmitting(true);
    try {
      await requestAdminMfaApi(
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'challenge',
            factorId: challengeFactorId,
            code: challengeCode.trim(),
          }),
        },
        t('messages.session_verify_failed'),
      );

      setChallengeCode('');
      await refreshMfaState();
      toast.success(t('messages.session_verified'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('messages.session_verify_failed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveFactor(factorId: string) {
    if (isRemovingFactorId) return;
    if (!confirm(t('confirm_remove_factor'))) return;

    setIsRemovingFactorId(factorId);
    try {
      await requestAdminMfaApi(
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'unenroll',
            factorId,
          }),
        },
        t('messages.factor_remove_failed'),
      );

      if (pendingEnrollment?.factorId === factorId) {
        setPendingEnrollment(null);
        setVerificationCode('');
      }

      await refreshMfaState();
      toast.success(t('messages.factor_removed'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('messages.factor_remove_failed');
      toast.error(message);
    } finally {
      setIsRemovingFactorId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[24px] border border-kode01-sauge/15 bg-kode01-white p-6 text-sm text-kode01-noir/60">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span>{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {t('status.title')}
            </CardTitle>
            <CardDescription className="text-kode01-noir/50">{t('status.subtitle')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                isMfaEnforced
                  ? 'border-kode01-green/20 bg-kode01-green/10 text-kode01-green'
                  : 'border-kode01-pink/20 bg-kode01-pink/10 text-kode01-pink'
              }
            >
              {isMfaEnforced ? (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck size={14} />
                  {t('status.protected')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert size={14} />
                  {t('status.action_required')}
                </span>
              )}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {t('status.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-kode01-noir/70 md:grid-cols-3">
          <div className="rounded-2xl border border-kode01-sauge/15 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('status.current_aal')}
            </p>
            <p className="mt-2 text-lg font-semibold text-kode01-noir">{currentAal ?? '-'}</p>
          </div>
          <div className="rounded-2xl border border-kode01-sauge/15 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('status.verified_factors')}
            </p>
            <p className="mt-2 text-lg font-semibold text-kode01-noir">{verifiedFactors.length}</p>
          </div>
          <div className="rounded-2xl border border-kode01-sauge/15 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
              {t('status.total_factors')}
            </p>
            <p className="mt-2 text-lg font-semibold text-kode01-noir">{factors.length}</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showModalSessionChallenge}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md rounded-2xl border-kode01-sauge/20"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-serif font-black text-kode01-noir">
              {t('session_challenge.title')}
            </DialogTitle>
            <DialogDescription className="text-kode01-noir/50">
              {t('session_challenge.subtitle')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="mfa-session-factor-modal">{t('session_challenge.factor_label')}</Label>
              <select
                id="mfa-session-factor-modal"
                value={challengeFactorId ?? ''}
                onChange={(event) => setChallengeFactorId(event.target.value || null)}
                className="h-11 rounded-xl border border-kode01-sauge/20 px-3 text-sm text-kode01-noir outline-none focus:border-kode01-pink/40"
              >
                {verifiedFactors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || factor.factor_type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mfa-session-code-modal">{t('session_challenge.code_label')}</Label>
              <Input
                id="mfa-session-code-modal"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={challengeCode}
                onChange={(event) => setChallengeCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('session_challenge.code_placeholder')}
              />
            </div>
            <Button
              type="button"
              onClick={handleSessionChallenge}
              disabled={isSubmitting || !challengeFactorId}
              className="w-full"
            >
              {isSubmitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              {t('session_challenge.verify_button')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showInlineSessionChallenge ? (
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-serif font-black text-kode01-noir">
              {t('session_challenge.title')}
            </CardTitle>
            <CardDescription className="text-kode01-noir/50">
              {t('session_challenge.subtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="mfa-session-factor">{t('session_challenge.factor_label')}</Label>
              <select
                id="mfa-session-factor"
                value={challengeFactorId ?? ''}
                onChange={(event) => setChallengeFactorId(event.target.value || null)}
                className="h-11 rounded-xl border border-kode01-sauge/20 px-3 text-sm text-kode01-noir outline-none focus:border-kode01-pink/40"
              >
                {verifiedFactors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || factor.factor_type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mfa-session-code">{t('session_challenge.code_label')}</Label>
              <Input
                id="mfa-session-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={challengeCode}
                onChange={(event) => setChallengeCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('session_challenge.code_placeholder')}
              />
            </div>
            <Button type="button" onClick={handleSessionChallenge} disabled={isSubmitting || !challengeFactorId}>
              {isSubmitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              {t('session_challenge.verify_button')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-serif font-black text-kode01-noir">
            {t('enroll.title')}
          </CardTitle>
          <CardDescription className="text-kode01-noir/50">{t('enroll.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pendingEnrollment ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="mfa-friendly-name">{t('enroll.friendly_name_label')}</Label>
                <Input
                  id="mfa-friendly-name"
                  value={enrollmentName}
                  onChange={(event) => setEnrollmentName(event.target.value)}
                  placeholder={t('enroll.friendly_name_placeholder')}
                />
              </div>
              <Button type="button" onClick={handleEnrollTotp} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                {t('enroll.start_button')}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-kode01-sauge/20 bg-kode01-sauge/5 p-4 text-sm">
                <p className="font-medium text-kode01-noir">{t('enroll.scan_instruction')}</p>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
                  <Image
                    src={pendingEnrollment.qrCode}
                    alt={t('enroll.qr_alt')}
                    width={176}
                    height={176}
                    unoptimized
                    className="h-44 w-44 rounded-xl border border-kode01-sauge/20 bg-white p-2"
                  />
                  <div className="text-kode01-noir/60">
                    <p>{t('enroll.secret_label')}</p>
                    <p className="mt-1 break-all font-mono text-xs text-kode01-noir">
                      {pendingEnrollment.secret ?? '-'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mfa-verify-code">{t('enroll.code_label')}</Label>
                <Input
                  id="mfa-verify-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('enroll.code_placeholder')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleVerifyEnrollment} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                  {t('enroll.verify_button')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingEnrollment(null);
                    setVerificationCode('');
                  }}
                  disabled={isSubmitting}
                >
                  {t('enroll.cancel_button')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[24px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-serif font-black text-kode01-noir">
            {t('factors.title')}
          </CardTitle>
          <CardDescription className="text-kode01-noir/50">{t('factors.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {factors.length === 0 ? (
            <p className="text-sm text-kode01-noir/50">{t('factors.empty')}</p>
          ) : (
            factors.map((factor) => (
              <div
                key={factor.id}
                className="flex flex-col gap-3 rounded-2xl border border-kode01-sauge/15 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-kode01-noir">
                    {factor.friendly_name || factor.factor_type}
                  </p>
                  <p className="mt-1 text-xs text-kode01-noir/50">
                    {t('factors.type')}: {factor.factor_type.toUpperCase()} | {t('factors.created_at')}:{' '}
                    {getSafeDateLabel(factor.created_at, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      factor.status === 'verified'
                        ? 'border-kode01-green/20 bg-kode01-green/10 text-kode01-green'
                        : 'border-kode01-pink/20 bg-kode01-pink/10 text-kode01-pink'
                    }
                  >
                    {factor.status}
                  </Badge>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-kode01-noir/40 hover:text-kode01-pink hover:bg-kode01-pink/10"
                    onClick={() => handleRemoveFactor(factor.id)}
                    disabled={isRemovingFactorId === factor.id}
                    aria-label={t('factors.remove_button')}
                  >
                    {isRemovingFactorId === factor.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {isMfaEnforced && !hideBackButton ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={safeReturnPath}>{t('back_button')}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
