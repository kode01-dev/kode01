'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
    EmbeddedCheckoutProvider,
    EmbeddedCheckout
} from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

// Initialize Stripe outside of component to avoid recreating it
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    productId: string;
    finalPrice?: number;
}

type AppliedCoupon = {
    id: string;
    code: string;
    discountAmount: number;
    finalAmount: number;
};

export function CheckoutModal({ isOpen, onClose, productId, finalPrice }: CheckoutModalProps) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [promoCode, setPromoCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
    const [promoError, setPromoError] = useState<string | null>(null);
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
    const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
    const t = useTranslations('product');

    const initializeCheckout = useCallback(async (couponCode?: string) => {
        setIsLoadingCheckout(true);
        setClientSecret(null);
        setError(null);

        try {
            const response = await fetch('/api/stripe/embedded-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    finalPrice,
                    ...(couponCode ? { couponCode } : {}),
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || t('checkout_failed') || 'Failed to initialize checkout');
            }

            if (!data?.clientSecret) {
                throw new Error(t('checkout_failed') || 'Failed to initialize checkout');
            }

            setClientSecret(data.clientSecret);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(t('checkout_failed') || 'An unknown error occurred');
            }
        } finally {
            setIsLoadingCheckout(false);
        }
    }, [finalPrice, productId, t]);

    const applyCoupon = useCallback(async () => {
        const normalized = promoCode.trim();
        if (!normalized) {
            setPromoError(t('promo_code_required') || 'Enter a promo code first.');
            return;
        }

        setIsApplyingCoupon(true);
        setPromoError(null);
        setError(null);

        try {
            const response = await fetch('/api/coupons/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: normalized,
                    productId,
                    ...(typeof finalPrice === 'number' ? { orderAmount: finalPrice } : {}),
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.valid || !payload?.coupon) {
                throw new Error(payload?.error || t('promo_invalid') || 'Invalid promo code.');
            }

            const nextCoupon: AppliedCoupon = {
                id: payload.coupon.id,
                code: payload.coupon.code,
                discountAmount: Number(payload.coupon.discountAmount ?? 0),
                finalAmount: Number(payload.coupon.finalAmount ?? 0),
            };

            setAppliedCoupon(nextCoupon);
            setPromoCode(nextCoupon.code);
            await initializeCheckout(nextCoupon.code);
        } catch (err: unknown) {
            setAppliedCoupon(null);
            if (err instanceof Error) {
                setPromoError(err.message);
            } else {
                setPromoError(t('promo_invalid') || 'Invalid promo code.');
            }
        } finally {
            setIsApplyingCoupon(false);
        }
    }, [finalPrice, initializeCheckout, productId, promoCode, t]);

    const removeCoupon = useCallback(async () => {
        setAppliedCoupon(null);
        setPromoError(null);
        setPromoCode('');
        await initializeCheckout();
    }, [initializeCheckout]);

    useEffect(() => {
        if (!isOpen) {
            setClientSecret(null);
            setError(null);
            setPromoCode('');
            setPromoError(null);
            setAppliedCoupon(null);
            setIsApplyingCoupon(false);
            setIsLoadingCheckout(false);
            return;
        }

        const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        const isStripeConfigured = stripeKey && !stripeKey.includes('pk_test_xxxxxx') && stripeKey !== '';

        if (!isStripeConfigured) {
            setError(t('stripe_not_configured') || 'Payments are currently disabled. Please check back later.');
            return;
        }

        void initializeCheckout();
    }, [initializeCheckout, isOpen, t]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            {/* Dark themed modal content */}
            <DialogContent
                id="product-checkout-modal"
                className="max-w-4xl p-0 overflow-hidden bg-kode01-white border-none rounded-[32px] sm:rounded-[40px] shadow-2xl"
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{t('buy_now')}</DialogTitle>
                    <DialogDescription>Complete your purchase securely</DialogDescription>
                </DialogHeader>

                <div id="product-checkout-modal-content" className="bg-kode01-white text-kode01-noir w-full relative">
                    <div className="border-b border-black/10 px-6 py-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                            {t('promo_code_label') || 'Promo code'}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={promoCode}
                                onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                                placeholder={t('promo_code_placeholder') || 'Enter promo code'}
                                className="h-10"
                            />
                            {appliedCoupon ? (
                                <Button
                                    type="button"
                                    onClick={() => {
                                        void removeCoupon();
                                    }}
                                    variant="outline"
                                    className="h-10 rounded-full font-bold"
                                    disabled={isLoadingCheckout}
                                >
                                    {t('promo_remove') || 'Remove'}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={() => {
                                        void applyCoupon();
                                    }}
                                    className="h-10 rounded-full font-bold bg-kode01-noir text-white hover:bg-kode01-noir/90"
                                    disabled={isApplyingCoupon || isLoadingCheckout}
                                >
                                    {isApplyingCoupon
                                        ? (t('promo_applying') || 'Applying...')
                                        : (t('promo_apply') || 'Apply')}
                                </Button>
                            )}
                        </div>
                        {appliedCoupon ? (
                            <p className="text-xs font-semibold text-kode01-green">
                                {(t('promo_applied') || 'Promo code applied: {code} (-${amount})')
                                    .replace('{code}', appliedCoupon.code)
                                    .replace('{amount}', appliedCoupon.discountAmount.toFixed(2))}
                            </p>
                        ) : null}
                        {promoError ? (
                            <p className="text-xs font-semibold text-red-600">{promoError}</p>
                        ) : null}
                    </div>

                    {error ? (
                        <div id="product-checkout-error-state" className="p-12 text-center text-red-500 font-bold space-y-4">
                            <p>{error}</p>
                            <button
                                id="product-checkout-close-button"
                                onClick={onClose}
                                className="px-6 py-2 bg-kode01-noir text-white rounded-full font-bold text-sm"
                            >
                                Close
                            </button>
                        </div>
                    ) : clientSecret ? (
                            <EmbeddedCheckoutProvider
                                stripe={stripePromise}
                                options={{ clientSecret }}
                            >
                                <div id="product-checkout-embedded-container" className="h-[80vh] overflow-y-auto">
                                <EmbeddedCheckout />
                            </div>
                        </EmbeddedCheckoutProvider>
                    ) : (
                        <div id="product-checkout-loading-state" className="p-24 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kode01-pink"></div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
