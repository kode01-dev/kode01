'use client';

import { useTranslations } from 'next-intl';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/features/cart/CartProvider';
import { toast } from 'sonner';

export interface Product {
    id: string;
    variantId?: string | null;
    title: string;
    price: number;
    coverImage?: string;
}

export function AddToCartButton({ product }: { product: Product }) {
    const t = useTranslations('product');
    const { items, addItem } = useCart();

    const normalizedVariantId = product.variantId ?? null;
    const isInCart = items.some((item) => {
        return item.productId === product.id && (item.variantId ?? null) === normalizedVariantId;
    });

    const handleAdd = async () => {
        if (isInCart) return;

        try {
            await addItem({
                productId: product.id,
                variantId: normalizedVariantId,
                title: product.title,
                price: product.price,
                coverImageUrl: product.coverImage,
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to add item to cart');
        }
    };

    if (isInCart) {
        return (
            <button
                disabled
                className="w-full py-4 flex items-center justify-center gap-2 text-gray-500 bg-gray-100 font-bold rounded-xl border border-gray-200 opacity-80 cursor-not-allowed transition-all"
            >
                <Check size={20} className="text-kode01-pink" />
                In Cart
            </button>
        );
    }

    return (
        <button
            onClick={() => {
                void handleAdd();
            }}
            className="w-full py-4 flex items-center justify-center gap-2 text-white bg-kode01-pink font-bold rounded-xl hover:shadow-[0_8px_30px_rgba(242,145,200,0.3)] hover:-translate-y-0.5 transition-all active:scale-[0.97]"
        >
            <ShoppingCart size={20} />
            {t('add_to_cart')}
        </button>
    );
}
