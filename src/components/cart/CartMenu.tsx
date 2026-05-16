'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingCart, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCart } from '@/features/cart/CartProvider';
import Image from 'next/image';
import { toast } from 'sonner';

interface CartMenuProps {
    children?: React.ReactNode;
    iconClassName?: string;
}

export function CartMenu({ children, iconClassName }: CartMenuProps) {
    const t = useTranslations('cart');
    const { items, subtotal, removeItem, startCheckout, isAuthenticated, loading } = useCart();
    const [isRemovingId, setIsRemovingId] = useState<string | null>(null);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

    async function handleRemove(itemId: string) {
        if (isRemovingId) return;

        try {
            setIsRemovingId(itemId);
            await removeItem(itemId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to remove item');
        } finally {
            setIsRemovingId(null);
        }
    }

    async function handleCheckout() {
        if (isCheckoutLoading) return;

        if (!isAuthenticated) {
            toast.error('Please sign in to checkout.');
            return;
        }

        try {
            setIsCheckoutLoading(true);
            const checkout = await startCheckout();
            if (!checkout.sessions.length) {
                throw new Error('Your cart is empty.');
            }

            if (checkout.multiVendor && checkout.sessions.length > 1) {
                toast.message('Multiple sellers detected. You will complete one payment per seller.');
            }

            const redirectUrl = checkout.redirectUrl ?? checkout.sessions[0]?.checkoutUrl;
            if (!redirectUrl) {
                throw new Error('Unable to generate checkout URL.');
            }

            window.location.href = redirectUrl;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to start checkout');
            setIsCheckoutLoading(false);
        }
    }

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                {children || (
                    <div className="relative flex items-center justify-center outline-none cursor-pointer">
                        <ShoppingCart className={iconClassName || "w-[22px] h-[22px] text-white/70 hover:text-white transition-colors"} />
                        {items.length > 0 && (
                            <span className="absolute -top-2 -right-3 bg-kode01-pink text-kode01-noir text-[10px] font-bold w-[20px] h-[20px] rounded-full flex items-center justify-center">
                                {items.length}
                            </span>
                        )}
                    </div>
                )}
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                sideOffset={16}
                collisionPadding={8}
                className="w-[calc(100vw-1rem)] sm:w-[400px] p-0 border border-white/10 bg-kode01-noir text-white shadow-2xl overflow-hidden font-sans rounded-3xl z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
            >
                <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white/5 text-white flex items-center justify-center border border-white/10">
                            <ShoppingCart size={16} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg leading-tight">
                                {t('title')}
                            </h3>
                            <p className="text-xs text-white/60 font-medium mt-0.5">
                                {items.length} {items.length !== 1 ? 'items' : 'item'}
                            </p>
                        </div>
                    </div>
                    <span className="text-[10px] font-bold text-white/30 tracking-widest uppercase">
                        KODE01.
                    </span>
                </div>

                <div className="max-h-[360px] overflow-y-auto scrollbar-hide px-5 py-5 flex flex-col gap-3">
                    {loading && items.length === 0 ? (
                        <div className="py-8 text-center text-xs text-white/50 font-medium">
                            Loading cart...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                    <ShoppingCart size={24} className="text-white/30" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-sm font-bold text-white">
                                    {t('empty')}
                                </p>
                                <p className="text-xs text-white/50 font-medium max-w-[220px] mx-auto">
                                    {t('empty_desc')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.id}
                                className="group relative flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-3 transition-all duration-200 hover:bg-white/10"
                            >
                                <div className="h-14 w-14 rounded-xl bg-kode01-noir border border-white/10 overflow-hidden shrink-0 relative">
                                    {item.coverImageUrl ? (
                                        <Image
                                            src={item.coverImageUrl}
                                            alt={item.title}
                                            fill
                                            className="object-cover"
                                            sizes="56px"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 pr-9">
                                    <h4 className="font-bold text-[14px] text-white truncate">
                                        {item.title}
                                    </h4>
                                    <p className="font-semibold text-sm text-kode01-pink mt-0.5">
                                        ${item.price.toFixed(2)}
                                    </p>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        void handleRemove(item.id);
                                    }}
                                    disabled={isRemovingId === item.id}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-transparent text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    aria-label={t('remove')}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {items.length > 0 && (
                    <div className="p-6 bg-kode01-noir border-t border-white/10">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <span className="text-sm text-white/70 font-medium">
                                {t('subtotal')}
                            </span>
                            <span className="text-xl font-bold text-white">
                                ${subtotal.toFixed(2)}
                            </span>
                        </div>
                        <button
                            id="cart-checkout-btn"
                            onClick={() => {
                                void handleCheckout();
                            }}
                            disabled={isCheckoutLoading}
                            className="w-full py-3.5 bg-kode01-pink text-kode01-noir font-bold text-base rounded-full hover:opacity-90 transition-all cursor-pointer border-none disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isCheckoutLoading ? 'Preparing checkout...' : t('checkout')}
                        </button>
                        <p className="text-[11px] text-white/40 font-medium text-center mt-4">
                            {t('secure_note')}
                        </p>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

