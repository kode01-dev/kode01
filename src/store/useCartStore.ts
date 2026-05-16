import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
    /** Guest cart item key (`product_id[:variant_id]`) */
    id: string;
    product_id?: string;
    variant_id?: string | null;
    title: string;
    price: number;
    cover_image_url?: string;
}

interface CartState {
    items: CartItem[];
    /** Timestamp (ms) when the first item was added to the current cart session */
    cartCreatedAt: number | null;
    /** Timestamp (ms) when the last item was added */
    lastItemAddedAt: number | null;
    /** Whether the user dismissed the abandoned cart reminder */
    reminderDismissed: boolean;
    /** Timestamp (ms) when the reminder was last dismissed */
    reminderDismissedAt: number | null;

    addItem: (item: CartItem) => void;
    removeItem: (id: string) => void;
    clearCart: () => void;
    dismissReminder: () => void;
    resetReminder: () => void;
}

/** Time thresholds (in ms) */
export const CART_ABANDON_THRESHOLD = 30 * 60 * 1000;      // 30 minutes
export const REMINDER_COOLDOWN = 24 * 60 * 60 * 1000;  // 24 hours before showing reminder again

export function buildGuestCartItemId(productId: string, variantId?: string | null): string {
    const normalizedVariantId = variantId?.trim();
    return normalizedVariantId ? `${productId}:${normalizedVariantId}` : productId;
}

export function getGuestCartProductId(item: CartItem): string {
    if (item.product_id) return item.product_id;
    const [productId] = item.id.split(':');
    return productId;
}

export function getGuestCartVariantId(item: CartItem): string | null {
    if ('variant_id' in item) return item.variant_id ?? null;
    const [, variantId] = item.id.split(':');
    return variantId ?? null;
}

export const useCartStore = create<CartState>()(
    persist(
        (set) => ({
            items: [],
            cartCreatedAt: null,
            lastItemAddedAt: null,
            reminderDismissed: false,
            reminderDismissedAt: null,

            addItem: (item) => set((state) => {
                // Prevent duplicate items
                if (state.items.some(i => i.id === item.id)) {
                    return state;
                }
                const now = Date.now();
                return {
                    items: [...state.items, item],
                    cartCreatedAt: state.cartCreatedAt ?? now,
                    lastItemAddedAt: now,
                    // Reset reminder if user adds a new item
                    reminderDismissed: false,
                    reminderDismissedAt: null,
                };
            }),
            removeItem: (id) => set((state) => {
                const newItems = state.items.filter(item => item.id !== id);
                // If cart is now empty, reset all timestamps
                if (newItems.length === 0) {
                    return {
                        items: [],
                        cartCreatedAt: null,
                        lastItemAddedAt: null,
                        reminderDismissed: false,
                        reminderDismissedAt: null,
                    };
                }
                return { items: newItems };
            }),
            clearCart: () => set({
                items: [],
                cartCreatedAt: null,
                lastItemAddedAt: null,
                reminderDismissed: false,
                reminderDismissedAt: null,
            }),
            dismissReminder: () => set({
                reminderDismissed: true,
                reminderDismissedAt: Date.now(),
            }),
            resetReminder: () => set({
                reminderDismissed: false,
                reminderDismissedAt: null,
            }),
        }),
        {
            name: 'kode01-cart-store',
        }
    )
);

// ─── Abandoned Cart Selectors ─────────────────────────────────────
/**
 * Returns `true` when the cart has items that have been sitting
 * longer than the abandon threshold, and the reminder hasn't
 * been dismissed (or the cooldown has expired).
 */
export function isCartAbandoned(state: CartState): boolean {
    if (state.items.length === 0) return false;
    if (!state.lastItemAddedAt) return false;

    const timeSinceLastAdd = Date.now() - state.lastItemAddedAt;
    const isOldEnough = timeSinceLastAdd >= CART_ABANDON_THRESHOLD;

    if (!isOldEnough) return false;

    // If reminder was dismissed, check cooldown
    if (state.reminderDismissed && state.reminderDismissedAt) {
        const timeSinceDismiss = Date.now() - state.reminderDismissedAt;
        return timeSinceDismiss >= REMINDER_COOLDOWN;
    }

    return true;
}

/**
 * Returns a human-readable time elapsed since items were last added.
 * e.g. "2 hours ago", "3 days ago"
 */
export function getCartAbandonedDuration(lastItemAddedAt: number | null): string {
    if (!lastItemAddedAt) return '';
    const diff = Date.now() - lastItemAddedAt;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'just now';
}
