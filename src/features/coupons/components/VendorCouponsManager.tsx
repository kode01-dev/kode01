'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type VendorCoupon = {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  productIds: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stripeConfigured: boolean;
  preview: {
    discountOn100: number;
    netOn100: number;
  };
};

type VendorProduct = {
  id: string;
  title: string;
  price: number;
  status: string;
};

type CouponsResponse = {
  data?: {
    coupons: VendorCoupon[];
    products: VendorProduct[];
  };
  error?: string;
};

type CouponMutationResponse = {
  data?: VendorCoupon;
  error?: string;
};

type CouponFormState = {
  code: string;
  type: 'percentage' | 'fixed';
  value: string;
  minOrderAmount: string;
  maxUses: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  productIds: string[];
};

const INITIAL_FORM: CouponFormState = {
  code: '',
  type: 'percentage',
  value: '10',
  minOrderAmount: '',
  maxUses: '',
  validFrom: '',
  validUntil: '',
  isActive: true,
  productIds: [],
};

function toInputDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatTypeLabel(type: 'percentage' | 'fixed'): string {
  return type === 'percentage' ? 'Percentage' : 'Fixed';
}

export function VendorCouponsManager({ locale }: { locale: string }) {
  const isFr = locale === 'fr';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<VendorCoupon[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponFormState>(INITIAL_FORM);

  const selectedCoupon = useMemo(
    () => coupons.find((coupon) => coupon.id === selectedCouponId) ?? null,
    [coupons, selectedCouponId],
  );

  const isEditing = Boolean(selectedCouponId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/vendor/coupons', { method: 'GET' });
      const payload = (await response.json().catch(() => null)) as CouponsResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to load coupons (${response.status})`);
      }

      const nextCoupons = payload?.data?.coupons ?? [];
      setCoupons(nextCoupons);
      setProducts(payload?.data?.products ?? []);
      setSelectedCouponId((current) => {
        if (current && nextCoupons.some((coupon) => coupon.id === current)) return current;
        return null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (isFr ? 'Chargement impossible.' : 'Failed to load.'));
      setCoupons([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [isFr]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedCoupon) {
      setForm(INITIAL_FORM);
      return;
    }

    setForm({
      code: selectedCoupon.code,
      type: selectedCoupon.type,
      value: String(selectedCoupon.value),
      minOrderAmount: selectedCoupon.minOrderAmount != null ? String(selectedCoupon.minOrderAmount) : '',
      maxUses: selectedCoupon.maxUses != null ? String(selectedCoupon.maxUses) : '',
      validFrom: toInputDateTime(selectedCoupon.validFrom),
      validUntil: toInputDateTime(selectedCoupon.validUntil),
      isActive: selectedCoupon.isActive,
      productIds: selectedCoupon.productIds ?? [],
    });
  }, [selectedCoupon]);

  function resetFormToCreate() {
    setSelectedCouponId(null);
    setForm(INITIAL_FORM);
    setError(null);
  }

  function toggleProductId(productId: string) {
    setForm((current) => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter((id) => id !== productId)
        : [...current.productIds, productId],
    }));
  }

  async function saveCoupon() {
    if (!form.code.trim()) {
      setError(isFr ? 'Le code promo est requis.' : 'Coupon code is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        type: form.type,
        value: Number(form.value || '0'),
        minOrderAmount: form.minOrderAmount.trim() ? Number(form.minOrderAmount) : null,
        maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
        validFrom: toIsoOrNull(form.validFrom),
        validUntil: toIsoOrNull(form.validUntil),
        isActive: form.isActive,
        productIds: form.productIds.length > 0 ? form.productIds : null,
      };

      const endpoint = isEditing
        ? `/api/vendor/coupons/${selectedCouponId}`
        : '/api/vendor/coupons';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as CouponMutationResponse | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to save coupon (${response.status})`);
      }

      await fetchData();
      if (body?.data?.id) {
        setSelectedCouponId(body.data.id);
      } else if (!isEditing) {
        resetFormToCreate();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : (isFr ? 'Sauvegarde impossible.' : 'Failed to save coupon.'));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCoupon(couponId: string) {
    setDeletingCouponId(couponId);
    setError(null);
    try {
      const response = await fetch(`/api/vendor/coupons/${couponId}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to deactivate coupon (${response.status})`);
      }

      await fetchData();
      if (selectedCouponId === couponId) {
        resetFormToCreate();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : (isFr ? 'Suppression impossible.' : 'Failed to delete coupon.'));
    } finally {
      setDeletingCouponId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {isEditing
                ? (isFr ? 'Modifier un coupon' : 'Edit coupon')
                : (isFr ? 'Créer un coupon' : 'Create coupon')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              placeholder={isFr ? 'Code promo (ex: SPRING25)' : 'Coupon code (e.g. SPRING25)'}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value === 'fixed' ? 'fixed' : 'percentage';
                  setForm((current) => ({ ...current, type: nextType }));
                }}
                className="h-10 rounded-xl border border-black/10 px-3 text-sm text-kode01-noir outline-none focus:border-kode01-pink/70"
              >
                <option value="percentage">{isFr ? 'Pourcentage' : 'Percentage'}</option>
                <option value="fixed">{isFr ? 'Montant fixe (CAD)' : 'Fixed amount (CAD)'}</option>
              </select>
              <Input
                value={form.value}
                type="number"
                min="0"
                step={form.type === 'percentage' ? '0.1' : '0.01'}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                placeholder={form.type === 'percentage' ? '10' : '5.00'}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={form.minOrderAmount}
                type="number"
                min="0"
                step="0.01"
                onChange={(event) => setForm((current) => ({ ...current, minOrderAmount: event.target.value }))}
                placeholder={isFr ? 'Commande minimale (optionnel)' : 'Min order amount (optional)'}
              />
              <Input
                value={form.maxUses}
                type="number"
                min="1"
                step="1"
                onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))}
                placeholder={isFr ? 'Nombre max d’usages (optionnel)' : 'Max uses (optional)'}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={form.validFrom}
                type="datetime-local"
                onChange={(event) => setForm((current) => ({ ...current, validFrom: event.target.value }))}
              />
              <Input
                value={form.validUntil}
                type="datetime-local"
                onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-kode01-noir">
                {isFr ? 'Coupon actif' : 'Coupon active'}
              </span>
            </label>

            <div className="space-y-2 rounded-xl border border-black/10 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                {isFr ? 'Produits éligibles (laisser vide = tous vos produits)' : 'Eligible products (leave empty = all your products)'}
              </p>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {products.length === 0 ? (
                  <p className="text-xs text-kode01-noir/55">
                    {isFr ? 'Aucun produit disponible.' : 'No products available.'}
                  </p>
                ) : (
                  products.map((product) => (
                    <label key={product.id} className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-2 py-1.5">
                      <span className="text-xs font-semibold text-kode01-noir">
                        {product.title}
                      </span>
                      <input
                        type="checkbox"
                        checked={form.productIds.includes(product.id)}
                        onChange={() => toggleProductId(product.id)}
                        className="h-4 w-4"
                      />
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  void saveCoupon();
                }}
                disabled={saving}
                className="flex-1 rounded-full bg-kode01-noir text-white hover:bg-kode01-noir/90"
              >
                {saving
                  ? (isFr ? 'Enregistrement...' : 'Saving...')
                  : (isEditing ? (isFr ? 'Mettre à jour' : 'Update') : (isFr ? 'Créer' : 'Create'))}
              </Button>
              {isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFormToCreate}
                  className="rounded-full"
                >
                  {isFr ? 'Nouveau' : 'New'}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {isFr ? 'Vos coupons' : 'Your coupons'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-kode01-noir/60">{isFr ? 'Chargement...' : 'Loading...'}</p>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-kode01-noir/60">{isFr ? 'Aucun coupon pour le moment.' : 'No coupons yet.'}</p>
            ) : (
              coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className={`rounded-2xl border p-3 ${selectedCouponId === coupon.id ? 'border-kode01-pink bg-kode01-pink/10' : 'border-black/10'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCouponId(coupon.id)}
                      className="text-left"
                    >
                      <p className="font-bold text-kode01-noir">{coupon.code}</p>
                      <p className="text-xs text-kode01-noir/60">
                        {formatTypeLabel(coupon.type)} - {coupon.type === 'percentage' ? `${coupon.value}%` : `$${coupon.value.toFixed(2)} CAD`}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={coupon.isActive ? 'border-0 bg-kode01-green/15 text-kode01-green' : 'border-0 bg-black/10 text-kode01-noir/65'}
                      >
                        {coupon.isActive ? (isFr ? 'Actif' : 'Active') : (isFr ? 'Inactif' : 'Inactive')}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full px-3 text-xs font-bold"
                        disabled={deletingCouponId === coupon.id}
                        onClick={() => {
                          void deactivateCoupon(coupon.id);
                        }}
                      >
                        {deletingCouponId === coupon.id
                          ? (isFr ? '...' : '...')
                          : (isFr ? 'Désactiver' : 'Deactivate')}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-kode01-noir/60 flex flex-wrap gap-3">
                    <span>
                      {isFr ? 'Utilisations' : 'Uses'}: {coupon.currentUses}
                      {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ''}
                    </span>
                    <span>
                      {isFr ? 'Montant mini' : 'Min order'}: {coupon.minOrderAmount != null ? `$${coupon.minOrderAmount.toFixed(2)}` : '-'}
                    </span>
                    <span>
                      Stripe: {coupon.stripeConfigured ? 'OK' : 'Missing'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
