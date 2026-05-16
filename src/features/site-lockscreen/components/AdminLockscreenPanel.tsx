'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Lock, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LockscreenAdminConfig } from '../types';
import { normalizeLockscreenConfig } from '../lib/lockscreen-config';

export function AdminLockscreenPanel() {
  const t = useTranslations('dashboard.admin.lockscreen');

  const [config, setConfig] = useState<LockscreenAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Password form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Load configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/lockscreen/config', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(t('load_failed'));
      }

      const data = await response.json();
      const rawConfig = (data?.config ?? null) as Partial<LockscreenAdminConfig> | null;
      if (!rawConfig || typeof rawConfig !== 'object' || typeof rawConfig.id !== 'string') {
        throw new Error(t('invalid_config'));
      }

      setConfig({
        ...normalizeLockscreenConfig(rawConfig),
        id: rawConfig.id,
        created_at: typeof rawConfig.created_at === 'string' ? rawConfig.created_at : '',
        updated_at: typeof rawConfig.updated_at === 'string' ? rawConfig.updated_at : '',
        updated_by: typeof rawConfig.updated_by === 'string' ? rawConfig.updated_by : null,
      });
    } catch (err) {
      console.error(err);
      setError(t('load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Save configuration changes
  async function handleSaveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/lockscreen/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          is_enabled: config.is_enabled,
          auth_gate_enabled: config.auth_gate_enabled,
          title_en: config.title_en,
          title_fr: config.title_fr,
          message_en: config.message_en,
          message_fr: config.message_fr,
          newsletter_enabled: config.newsletter_enabled,
          newsletter_title_en: config.newsletter_title_en,
          newsletter_title_fr: config.newsletter_title_fr,
          newsletter_cta_en: config.newsletter_cta_en,
          newsletter_cta_fr: config.newsletter_cta_fr,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('save_failed'));
      }

      setMessage(t('saved'));
      await loadConfig();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('save_failed'));
    } finally {
      setSaving(false);
    }
  }

  // Update password
  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError(t('password_mismatch'));
      return;
    }

    // Validate minimum length
    if (newPassword.length < 8) {
      setError(t('password_too_short'));
      return;
    }

    setUpdatingPassword(true);

    try {
      const response = await fetch('/api/admin/lockscreen/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('password_update_failed'));
      }

      setMessage(t('password_updated'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('save_failed'));
    } finally {
      setUpdatingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={32} className="animate-spin text-kode01-pink" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t('load_failed')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Messages */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-noir">
          {message}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('title')}
          </CardTitle>
          <p className="text-[11px] uppercase tracking-widest text-kode01-noir/50 font-bold">
            {t('subtitle')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div
              className={`rounded-2xl border-2 px-6 py-4 ${
                config.is_enabled
                  ? 'border-kode01-pink bg-kode01-pink/5'
                  : 'border-kode01-sauge/20 bg-kode01-sauge/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock size={24} className={config.is_enabled ? 'text-kode01-pink' : 'text-kode01-noir/40'} />
                  <div>
                    <p className="font-bold text-kode01-noir">
                      {config.is_enabled ? t('enabled_status') : t('disabled_status')}
                    </p>
                    <p className="text-xs text-kode01-noir/60 mt-1">
                      {config.is_enabled
                        ? t('enabled_description')
                        : t('disabled_description')}
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <span className="text-sm font-bold text-kode01-noir">{t('toggle_label')}</span>
                  <input
                    type="checkbox"
                    checked={config.is_enabled}
                    onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })}
                    className="h-6 w-6 rounded accent-kode01-pink"
                  />
                </label>
              </div>
            </div>

            <div
              className={`rounded-2xl border-2 px-6 py-4 ${
                config.auth_gate_enabled
                  ? 'border-kode01-pink bg-kode01-pink/5'
                  : 'border-kode01-sauge/20 bg-kode01-sauge/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock size={24} className={config.auth_gate_enabled ? 'text-kode01-pink' : 'text-kode01-noir/40'} />
                  <div>
                    <p className="font-bold text-kode01-noir">
                      {config.auth_gate_enabled ? t('auth_gate_enabled_status') : t('auth_gate_disabled_status')}
                    </p>
                    <p className="text-xs text-kode01-noir/60 mt-1">
                      {config.auth_gate_enabled
                        ? t('auth_gate_enabled_description')
                        : t('auth_gate_disabled_description')}
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <span className="text-sm font-bold text-kode01-noir">{t('auth_gate_toggle_label')}</span>
                  <input
                    type="checkbox"
                    checked={config.auth_gate_enabled}
                    onChange={(e) => setConfig({ ...config, auth_gate_enabled: e.target.checked })}
                    className="h-6 w-6 rounded accent-kode01-pink"
                  />
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Management */}
      <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-serif font-black text-kode01-noir">
            {t('password_section')}
          </CardTitle>
          <p className="text-[11px] uppercase tracking-widest text-kode01-noir/50 font-bold">
            {t('current_password_set')}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <Input
              type="password"
              placeholder={t('new_password')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <Input
              type="password"
              placeholder={t('confirm_password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button
              type="submit"
              disabled={updatingPassword}
              className="rounded-full bg-kode01-noir text-kode01-white text-[11px] uppercase tracking-widest"
            >
              {updatingPassword ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  {t('updating_password')}
                </>
              ) : (
                t('update_password')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Content Customization */}
      <form onSubmit={handleSaveConfig}>
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {t('content_section')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder={t('title_en')}
                value={config.title_en}
                onChange={(e) => setConfig({ ...config, title_en: e.target.value })}
                required
              />
              <Input
                placeholder={t('title_fr')}
                value={config.title_fr}
                onChange={(e) => setConfig({ ...config, title_fr: e.target.value })}
                required
              />
            </div>
            <textarea
              className="min-h-24 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
              placeholder={t('message_en')}
              value={config.message_en}
              onChange={(e) => setConfig({ ...config, message_en: e.target.value })}
              required
            />
            <textarea
              className="min-h-24 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
              placeholder={t('message_fr')}
              value={config.message_fr}
              onChange={(e) => setConfig({ ...config, message_fr: e.target.value })}
              required
            />
          </CardContent>
        </Card>

        {/* Newsletter Settings */}
        <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir flex items-center gap-2">
              <Mail size={20} />
              {t('newsletter_section')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="inline-flex items-center gap-2 text-sm text-kode01-noir/70">
              <input
                type="checkbox"
                checked={config.newsletter_enabled}
                onChange={(e) => setConfig({ ...config, newsletter_enabled: e.target.checked })}
              />
              {t('newsletter_enabled')}
            </label>

            {config.newsletter_enabled && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    placeholder={t('newsletter_title_en')}
                    value={config.newsletter_title_en}
                    onChange={(e) => setConfig({ ...config, newsletter_title_en: e.target.value })}
                    required={config.newsletter_enabled}
                  />
                  <Input
                    placeholder={t('newsletter_title_fr')}
                    value={config.newsletter_title_fr}
                    onChange={(e) => setConfig({ ...config, newsletter_title_fr: e.target.value })}
                    required={config.newsletter_enabled}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    placeholder={t('newsletter_cta_en')}
                    value={config.newsletter_cta_en}
                    onChange={(e) => setConfig({ ...config, newsletter_cta_en: e.target.value })}
                    required={config.newsletter_enabled}
                  />
                  <Input
                    placeholder={t('newsletter_cta_fr')}
                    value={config.newsletter_cta_fr}
                    onChange={(e) => setConfig({ ...config, newsletter_cta_fr: e.target.value })}
                    required={config.newsletter_enabled}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="mt-6">
          <Button
            type="submit"
            disabled={saving}
            className="rounded-full bg-kode01-noir text-kode01-white text-[11px] uppercase tracking-widest"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
