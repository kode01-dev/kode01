'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type ConnectStripeButtonProps = {
    hasStripeAccount?: boolean;
    disabled?: boolean;
    disabledReason?: string;
};

export function ConnectStripeButton({
    hasStripeAccount = false,
    disabled = false,
    disabledReason,
}: ConnectStripeButtonProps) {
    const t = useTranslations('dashboard.vendor');
    const locale = useLocale();
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);


    const handleConnect = async () => {
        if (disabled) return;
        try {
            setIsLoading(true);
            setErrorMessage(null);
            const res = await fetch('/api/stripe/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ locale }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
                message?: string;
            };
            if (res.ok && data.url) {
                window.location.assign(data.url);
            } else {
                console.error('Failed to get Stripe connect URL:', data.error);
                setErrorMessage(data.message ?? data.error ?? t('connect_stripe_error'));
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Stripe connect error:', error);
            setErrorMessage(t('connect_stripe_error'));
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <Button
                onClick={handleConnect}
                disabled={isLoading || disabled}
                className="bg-kode01-green hover:bg-kode01-green/90 text-white font-medium shadow-sm hover:shadow-md transition-all rounded-full"
            >
                {isLoading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
                {isLoading ? t('connect_stripe_loading') : hasStripeAccount ? t('resume_stripe') : t('connect_stripe')}
            </Button>
            {disabled && disabledReason ? (
                <p className="text-xs text-kode01-noir/60">{disabledReason}</p>
            ) : null}
            {errorMessage ? (
                <p role="alert" className="rounded-2xl bg-kode01-pink/10 px-3 py-2 text-sm font-bold text-kode01-pink">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}
