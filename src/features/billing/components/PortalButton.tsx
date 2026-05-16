'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface PortalButtonProps {
    label: string;
    loadingLabel?: string;
    className?: string;
    returnPath?: string;
}

type PaymentMethodStatus = {
    stripeCustomerLinked: boolean;
    hasPaymentMethod: boolean;
    paymentMethodsCount: number;
    cardBrand: string | null;
    cardLast4: string | null;
};

const EMPTY_PAYMENT_STATUS: PaymentMethodStatus = {
    stripeCustomerLinked: false,
    hasPaymentMethod: false,
    paymentMethodsCount: 0,
    cardBrand: null,
    cardLast4: null,
};

type PaymentMethodStatusErrorResponse = {
    error?: string;
    code?: string;
};

function getStatusErrorMessage(data: PaymentMethodStatus | PaymentMethodStatusErrorResponse | null): string | null {
    if (!data || typeof data !== 'object' || !('error' in data)) return null;
    const maybeError = data.error;
    return typeof maybeError === 'string' && maybeError.trim().length > 0 ? maybeError : null;
}

export function PortalButton({
    label,
    loadingLabel,
    className,
    returnPath,
}: PortalButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<PaymentMethodStatus | null>(null);
    const [isStatusLoading, setIsStatusLoading] = useState(true);
    const [hasStatusError, setHasStatusError] = useState(false);
    const locale = useLocale();
    const t = useTranslations('settings');

    useEffect(() => {
        let isActive = true;
        const abortController = new AbortController();

        const fetchStatus = async () => {
            setIsStatusLoading(true);
            setHasStatusError(false);

            try {
                const response = await fetch('/api/stripe/payment-method-status', {
                    method: 'GET',
                    cache: 'no-store',
                    signal: abortController.signal,
                });
                const data = (await response.json().catch(() => null)) as
                    | PaymentMethodStatus
                    | PaymentMethodStatusErrorResponse
                    | null;

                if (response.ok) {
                    if (isActive) {
                        setStatus((data as PaymentMethodStatus) ?? EMPTY_PAYMENT_STATUS);
                    }
                    return;
                }

                const responseErrorMessage = getStatusErrorMessage(data);

                if (response.status === 404 && responseErrorMessage === 'Profile not found') {
                    if (isActive) {
                        setStatus(EMPTY_PAYMENT_STATUS);
                    }
                    return;
                }

                if (response.status === 429) {
                    if (isActive) {
                        setHasStatusError(true);
                    }
                    return;
                }

                throw new Error(responseErrorMessage || 'Failed to fetch payment method status');
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
                console.error('Payment method status error:', error);
                if (isActive) {
                    setHasStatusError(true);
                }
            } finally {
                if (isActive) {
                    setIsStatusLoading(false);
                }
            }
        };

        void fetchStatus();

        return () => {
            isActive = false;
            abortController.abort();
        };
    }, []);

    const handleOpenPortal = async () => {
        setIsLoading(true);

        try {
            const response = await fetch('/api/stripe/customer-portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    locale,
                    returnPath: returnPath || `/${locale}/dashboard/settings`,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to open customer portal');
            }

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No portal URL returned');
            }
        } catch (error) {
            console.error('Portal error:', error);
            toast.error(error instanceof Error ? error.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const statusLabel = isStatusLoading
        ? t('billing_status_loading')
        : hasStatusError
            ? t('billing_status_error')
            : t('billing_status_count', { count: status?.paymentMethodsCount ?? 0 });

    const defaultCardLabel =
        status?.cardBrand && status?.cardLast4
            ? t('billing_status_default_card', {
                brand: status.cardBrand.toUpperCase(),
                last4: status.cardLast4,
            })
            : null;

    return (
        <div className="space-y-3">
            <div className="space-y-1">
                <p className="text-sm font-semibold text-kode01-noir/80">{statusLabel}</p>
                {defaultCardLabel && (
                    <p className="text-xs text-kode01-noir/55">{defaultCardLabel}</p>
                )}
            </div>

            <button
                onClick={handleOpenPortal}
                disabled={isLoading}
                className={className}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {loadingLabel || label}
                    </>
                ) : (
                    label
                )}
            </button>
        </div>
    );
}
