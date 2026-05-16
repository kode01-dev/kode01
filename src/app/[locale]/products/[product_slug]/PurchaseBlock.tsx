'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AddToCartButton } from './AddToCartButton';
import { VariantSelector } from './VariantSelector';
import { NameYourPrice } from './NameYourPrice';
import { CheckoutModal } from './CheckoutModal';

export interface ProductVariant {
    id: string;
    name: string;
    price_override: number | null;
}

export interface GumroadProduct {
    id: string;
    title: string;
    price: number;
    originalPrice?: number;
    coverImage?: string;
    // Gumroad features
    isPWYW?: boolean;
    minPrice?: number;
    variants?: ProductVariant[];
}

interface PurchaseBlockProps {
    product: GumroadProduct;
}

export function PurchaseBlock({ product }: PurchaseBlockProps) {
    const t = useTranslations('product');

    // Default to first variant if exists
    const hasVariants = product.variants && product.variants.length > 0;
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
        hasVariants ? product.variants![0].id : null
    );

    const selectedVariant = hasVariants
        ? product.variants!.find(v => v.id === selectedVariantId)
        : null;

    // Determine the base price depending on variant selection
    const basePrice = selectedVariant?.price_override ?? product.price;

    const [customPrice, setCustomPrice] = useState<number>(
        product.isPWYW ? Math.max(product.minPrice || 0, basePrice) : basePrice
    );

    // When the user changes variant, update the custom price minimum/default
    const handleVariantChange = (variantId: string) => {
        setSelectedVariantId(variantId);
        const newlySelected = product.variants!.find(v => v.id === variantId);
        const newBasePrice = newlySelected?.price_override ?? product.price;
        if (!product.isPWYW || customPrice < newBasePrice) {
            setCustomPrice(newBasePrice);
        }
    };

    // Calculate final price to display and add to cart
    const finalPrice = product.isPWYW ? customPrice : basePrice;

    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

    return (
        <div className="relative z-10 w-full">
            <div className="mb-3 lg:mb-10">
                <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-4xl lg:text-5xl font-serif font-black tracking-tight text-kode01-noir lg:text-white">${finalPrice}</span>
                    {product.originalPrice && !product.isPWYW && !hasVariants && (
                        <span className="text-lg md:text-2xl text-kode01-noir/30 lg:text-white/30 line-through font-bold">${product.originalPrice}</span>
                    )}
                </div>

                {hasVariants && (
                    <div className="bg-kode01-noir/5 border border-kode01-noir/10 lg:bg-white/10 lg:border-white/20 rounded-2xl p-4 mb-6">
                        <VariantSelector
                            variants={product.variants!}
                            selectedVariantId={selectedVariantId}
                            onSelect={handleVariantChange}
                            basePrice={product.price}
                        />
                    </div>
                )}

                {product.isPWYW && (
                    <div className="bg-kode01-noir/5 border border-kode01-noir/10 lg:bg-white/10 lg:border-white/20 rounded-2xl p-4 mb-6">
                        <NameYourPrice
                            minPrice={product.minPrice || 0}
                            currentPrice={finalPrice}
                            onChange={setCustomPrice}
                        />
                    </div>
                )}
            </div>

            <div className="space-y-3 lg:space-y-0 lg:flex lg:gap-3 mb-2 lg:mb-10">
                <AddToCartButton product={{ ...product, price: finalPrice, variantId: selectedVariantId }} />
                <button
                    id="product-checkout-open-button"
                    onClick={() => setIsCheckoutOpen(true)}
                    className="w-full py-3.5 md:py-5 rounded-2xl bg-kode01-noir text-white lg:bg-white/5 lg:border lg:border-white/10 font-black text-sm uppercase tracking-widest hover:opacity-90 lg:hover:bg-white/10 transition-all">
                    {t('buy_now')}
                </button>
            </div>

            <CheckoutModal
                isOpen={isCheckoutOpen}
                onClose={() => setIsCheckoutOpen(false)}
                productId={product.id}
                finalPrice={finalPrice}
            />
        </div>
    );
}
