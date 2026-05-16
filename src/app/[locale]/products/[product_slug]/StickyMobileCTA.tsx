'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCartStore, isCartAbandoned } from '@/store/useCartStore';
import { CheckoutModal } from './CheckoutModal';

interface StickyMobileCTAProps {
    productId: string;
    productTitle: string;
    finalPrice: number;
    coverImage?: string;
    isPWYW?: boolean;
    hasVariants?: boolean;
}

export function StickyMobileCTA({
    productId,
    finalPrice,
    isPWYW,
    hasVariants,
}: StickyMobileCTAProps) {
    const t = useTranslations('product');
    const items = useCartStore((s) => s.items);

    const [isVisible, setIsVisible] = useState(false);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

    useEffect(() => {
        const purchaseBlock = document.getElementById('purchase-block-anchor');
        if (!purchaseBlock) return;

        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(!entry.isIntersecting),
            { threshold: 0 },
        );

        observer.observe(purchaseBlock);
        return () => observer.disconnect();
    }, []);

    const [abandonedVisible, setAbandonedVisible] = useState(false);
    useEffect(() => {
        const check = () => setAbandonedVisible(isCartAbandoned(useCartStore.getState()));
        check();
        const interval = setInterval(check, 60_000);
        return () => clearInterval(interval);
    }, [items]);

    if (!isVisible || abandonedVisible) return null;

    const needsOptions = isPWYW || hasVariants;

    const handleAction = () => {
        if (needsOptions) {
            const block = document.getElementById('purchase-block-anchor');
            if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            setIsCheckoutOpen(true);
        }
    };

    return (
        <>
            <button
                onClick={handleAction}
                className="fixed bottom-5 left-4 z-[90] lg:hidden animate-in fade-in slide-in-from-bottom-8 bg-kode01-noir text-white rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 text-sm font-bold hover:shadow-xl active:scale-[0.97] transition-all"
                style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}
            >
                <span className="font-serif font-black">${finalPrice}</span>
                <span className="text-white/30">·</span>
                <span>{needsOptions ? t('sticky_view_options') : t('sticky_buy_now')}</span>
            </button>

            <CheckoutModal
                isOpen={isCheckoutOpen}
                onClose={() => setIsCheckoutOpen(false)}
                productId={productId}
                finalPrice={finalPrice}
            />
        </>
    );
}
