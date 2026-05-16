'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGuestCartItemId,
  getGuestCartProductId,
  getGuestCartVariantId,
  useCartStore,
} from '@/store/useCartStore';
import { useAuth } from '@/contexts/AuthContext';

export type UnifiedCartItem = {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  price: number;
  coverImageUrl: string | null;
  addedAt: string | null;
  sellerId: string | null;
};

export type CartCheckoutSession = {
  sellerId: string;
  itemCount: number;
  subtotal: number;
  checkoutUrl: string | null;
  checkoutSessionId: string | null;
};

export type StartCheckoutResult = {
  sessions: CartCheckoutSession[];
  redirectUrl: string | null;
  multiVendor: boolean;
};

type AddCartItemInput = {
  productId: string;
  variantId?: string | null;
  title: string;
  price: number;
  coverImageUrl?: string | null;
};

type CartContextValue = {
  items: UnifiedCartItem[];
  count: number;
  subtotal: number;
  loading: boolean;
  syncingGuest: boolean;
  isAuthenticated: boolean;
  addItem: (input: AddCartItemInput) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
  startCheckout: (locale?: 'en' | 'fr') => Promise<StartCheckoutResult>;
};

type ServerCartResponse = {
  cart: { id: string; status: string } | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    title: string;
    price: number;
    coverImageUrl: string | null;
    addedAt: string | null;
    sellerId: string | null;
  }>;
};

function resolveLocaleFromPathname(): 'en' | 'fr' {
  if (typeof window === 'undefined') return 'en';
  return window.location.pathname.startsWith('/fr') ? 'fr' : 'en';
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const guestItems = useCartStore((state) => state.items);
  const addGuestItem = useCartStore((state) => state.addItem);
  const removeGuestItem = useCartStore((state) => state.removeItem);
  const clearGuestCart = useCartStore((state) => state.clearCart);

  const [serverItems, setServerItems] = useState<UnifiedCartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingGuest, setSyncingGuest] = useState(false);

  const syncInFlightRef = useRef(false);
  const syncAttemptedForUserRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setServerItems([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/cart', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.status === 401) {
        setServerItems([]);
        return;
      }

      if (!response.ok) {
        const payload = await readJsonSafe<{ error?: string }>(response);
        throw new Error(payload?.error ?? 'Unable to load cart');
      }

      const payload = await readJsonSafe<ServerCartResponse>(response);
      setServerItems(payload?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setServerItems([]);
      syncAttemptedForUserRef.current = null;
      return;
    }

    void refresh();
  }, [isAuthenticated, refresh, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (guestItems.length === 0) return;
    if (syncInFlightRef.current) return;
    if (syncAttemptedForUserRef.current === user.id) return;

    syncInFlightRef.current = true;
    syncAttemptedForUserRef.current = user.id;
    setSyncingGuest(true);

    const run = async () => {
      try {
        // ⚡ Bolt: Parallelized guest cart merges to reduce synchronization latency.
        // Backend handles concurrent unique constraint inserts safely via Supabase upserts.
        const mergeResponses = await Promise.all(
          guestItems.map((guestItem) =>
            fetch('/api/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                productId: getGuestCartProductId(guestItem),
                variantId: getGuestCartVariantId(guestItem),
                priceSnapshot: guestItem.price,
              }),
            })
          )
        );

        const allMerged = mergeResponses.every((response) => response.ok);

        if (allMerged) {
          clearGuestCart();
        }

        await refresh();
      } finally {
        setSyncingGuest(false);
        syncInFlightRef.current = false;
      }
    };

    void run();
  }, [clearGuestCart, guestItems, isAuthenticated, refresh, user?.id]);

  const guestItemsMapped = useMemo<UnifiedCartItem[]>(
    () =>
      guestItems.map((item) => ({
        id: item.id,
        productId: getGuestCartProductId(item),
        variantId: getGuestCartVariantId(item),
        title: item.title,
        price: Number(item.price),
        coverImageUrl: item.cover_image_url ?? null,
        addedAt: null,
        sellerId: null,
      })),
    [guestItems],
  );

  const items = isAuthenticated ? serverItems : guestItemsMapped;
  const count = items.length;
  const subtotal = items.reduce((total, item) => total + Number(item.price), 0);

  const addItem = useCallback(
    async (input: AddCartItemInput) => {
      if (isAuthenticated) {
        const response = await fetch('/api/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            productId: input.productId,
            variantId: input.variantId ?? null,
            priceSnapshot: input.price,
          }),
        });

        if (!response.ok) {
          const payload = await readJsonSafe<{ error?: string }>(response);
          throw new Error(payload?.error ?? 'Unable to add item to cart');
        }

        await refresh();
        return;
      }

      addGuestItem({
        id: buildGuestCartItemId(input.productId, input.variantId),
        product_id: input.productId,
        variant_id: input.variantId ?? null,
        title: input.title,
        price: input.price,
        cover_image_url: input.coverImageUrl ?? undefined,
      });
    },
    [addGuestItem, isAuthenticated, refresh],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      if (isAuthenticated) {
        const response = await fetch(`/api/cart/${encodeURIComponent(itemId)}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const payload = await readJsonSafe<{ error?: string }>(response);
          throw new Error(payload?.error ?? 'Unable to remove item');
        }

        await refresh();
        return;
      }

      removeGuestItem(itemId);
    },
    [isAuthenticated, refresh, removeGuestItem],
  );

  const startCheckout = useCallback(
    async (locale?: 'en' | 'fr') => {
      if (!isAuthenticated) {
        throw new Error('AUTH_REQUIRED');
      }

      const response = await fetch('/api/cart/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          locale: locale ?? resolveLocaleFromPathname(),
        }),
      });

      const payload = await readJsonSafe<StartCheckoutResult & { error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to initialize checkout');
      }

      return {
        sessions: payload?.sessions ?? [],
        redirectUrl: payload?.redirectUrl ?? null,
        multiVendor: Boolean(payload?.multiVendor),
      };
    },
    [isAuthenticated],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count,
      subtotal,
      loading,
      syncingGuest,
      isAuthenticated,
      addItem,
      removeItem,
      refresh,
      startCheckout,
    }),
    [addItem, count, isAuthenticated, items, loading, refresh, removeItem, startCheckout, subtotal, syncingGuest],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
