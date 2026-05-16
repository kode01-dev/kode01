'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingCart, X, ArrowRight } from 'lucide-react';
import {
    useCartStore,
    isCartAbandoned,
    getCartAbandonedDuration,
} from '@/store/useCartStore';

export function AbandonedCartBanner() {
    const t = useTranslations('cart.abandoned');
    const store = useCartStore();
    const { items, lastItemAddedAt, dismissReminder } = store;

    const [visible, setVisible] = useState(false);
    const [closing, setClosing] = useState(false);

    // Check abandoned status on mount and every 60s
    useEffect(() => {
        const check = () => {
            const state = useCartStore.getState();
            setVisible(isCartAbandoned(state));
        };

        check();
        const interval = setInterval(check, 60_000);
        return () => clearInterval(interval);
    }, [items, lastItemAddedAt]);

    const handleDismiss = () => {
        setClosing(true);
        setTimeout(() => {
            dismissReminder();
            setVisible(false);
            setClosing(false);
        }, 300);
    };

    const handleCheckout = () => {
        // Scroll to top or trigger checkout — for now, click the cart checkout btn
        const checkoutBtn = document.getElementById('cart-checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.scrollIntoView({ behavior: 'smooth' });
            checkoutBtn.click();
        }
    };

    if (!visible) return null;

    const subtotal = items.reduce((acc, item) => acc + item.price, 0);
    const timeAgo = getCartAbandonedDuration(lastItemAddedAt);

    return (
        <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-[480px] transition-all duration-300 ${closing
                    ? 'opacity-0 translate-y-4'
                    : 'opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-6'
                }`}
        >
            <div className="relative bg-kode01-noir border border-white/10 shadow-2xl overflow-hidden font-sans rounded-3xl">
                {/* Dismiss button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer bg-transparent border-none rounded-full z-10"
                    aria-label="Dismiss"
                >
                    <X size={16} />
                </button>

                {/* Content */}
                <div className="px-6 pt-11 pb-5 flex items-center gap-4">
                    {/* Icon pulse */}
                    <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full bg-white/5 text-white flex items-center justify-center border border-white/10">
                            <ShoppingCart size={20} />
                        </div>
                        {/* Pulse ring */}
                        <span className="absolute inset-0 rounded-full border border-kode01-pink animate-ping opacity-30" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-base leading-tight">
                            {t('title')}
                        </p>
                        <p className="text-sm text-white/50 font-medium mt-1">
                            {t('subtitle', { count: items.length, time: timeAgo })}
                        </p>
                    </div>

                    {/* CTA */}
                    <div className="shrink-0 text-right pr-2">
                        <p className="font-bold text-kode01-pink text-xl">
                            ${subtotal.toFixed(2)}
                        </p>
                    </div>
                </div>

                {/* Action bar */}
                <div className="px-6 pb-5 flex gap-3">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-3 text-white/50 font-medium text-sm border border-white/10 rounded-xl hover:bg-white/5 hover:text-white transition-all cursor-pointer bg-transparent"
                    >
                        {t('dismiss')}
                    </button>
                    <button
                        onClick={handleCheckout}
                        className="flex-[2] py-3 bg-kode01-pink text-kode01-noir font-bold text-sm rounded-xl hover:opacity-90 transition-all cursor-pointer border-none flex items-center justify-center gap-2"
                    >
                        {t('cta')}
                        <ArrowRight size={16} />
                    </button>
                </div>

                {/* Brand footer line */}
                <div className="px-6 pb-4">
                    <p className="text-[10px] text-white/30 font-bold text-center tracking-widest uppercase">
                        KODE01. — {t('brand_note')}
                    </p>
                </div>
            </div>
        </div>
    );
}
