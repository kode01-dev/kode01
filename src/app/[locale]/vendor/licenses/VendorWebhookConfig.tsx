'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type VendorWebhookConfigProps = {
    initialWebhookUrl: string;
    initialApiSecret: string;
    initialWebhookSecret: string;
    initialEnabled: boolean;
};

export function VendorWebhookConfig(props: VendorWebhookConfigProps) {
    const t = useTranslations('dashboard.vendor.licenses_page');
    const [webhookUrl, setWebhookUrl] = useState(props.initialWebhookUrl);
    const [apiSecret, setApiSecret] = useState(props.initialApiSecret);
    const [webhookSecret, setWebhookSecret] = useState(props.initialWebhookSecret);
    const [enabled, setEnabled] = useState(props.initialEnabled);
    const [isSaving, setIsSaving] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isSaved, setIsSaved] = useState(false);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaved(false);
        setErrorKey(null);
        setIsSaving(true);

        try {
            const res = await fetch('/api/vendor/license-integration', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl, apiSecret, webhookSecret, enabled }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setErrorKey(data.error || 'unknown');
                return;
            }

            setIsSaved(true);
        } catch {
            setErrorKey('unknown');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Card className="overflow-hidden rounded-[32px] border-kode01-blue/20 bg-kode01-white shadow-sm">
            <CardContent className="px-6 py-7 sm:px-8">
                <h2 className="font-serif text-2xl font-black text-kode01-noir">{t('webhook_title')}</h2>
                <p className="mt-2 text-sm text-kode01-noir/70">{t('webhook_description')}</p>

                <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => setEnabled(!enabled)}
                        className="flex items-center gap-3"
                    >
                        <span className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-kode01-blue' : 'bg-black/20'}`}>
                            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </span>
                        <span className="text-sm font-bold text-kode01-noir/70">
                            {enabled ? t('webhook_enabled') : t('webhook_disabled')}
                        </span>
                    </button>

                    <div className="space-y-1.5">
                        <Label htmlFor="webhook-url" className="text-kode01-noir/70">
                            {t('webhook_url_label')}
                        </Label>
                        <Input
                            id="webhook-url"
                            value={webhookUrl}
                            onChange={(event) => setWebhookUrl(event.target.value)}
                            className="rounded-2xl border-black/10 h-11"
                            placeholder={t('webhook_url_placeholder')}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="api-secret" className="text-kode01-noir/70">
                            {t('api_secret_label')}
                        </Label>
                        <Input
                            id="api-secret"
                            type="password"
                            value={apiSecret}
                            onChange={(event) => setApiSecret(event.target.value)}
                            className="rounded-2xl border-black/10 h-11"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="webhook-secret" className="text-kode01-noir/70">
                            {t('webhook_secret_label')}
                        </Label>
                        <Input
                            id="webhook-secret"
                            type="password"
                            value={webhookSecret}
                            onChange={(event) => setWebhookSecret(event.target.value)}
                            className="rounded-2xl border-black/10 h-11"
                        />
                    </div>

                    {isSaved ? <p className="text-sm text-kode01-green">{t('webhook_saved')}</p> : null}
                    {errorKey ? <p className="text-sm text-kode01-pink">{t(`webhook_errors.${errorKey}`)}</p> : null}

                    <Button type="submit" disabled={isSaving} className="rounded-full bg-kode01-blue text-white hover:bg-kode01-blue/90">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                        {isSaving ? t('saving_webhook') : t('save_webhook')}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
