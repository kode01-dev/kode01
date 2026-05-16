'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type VendorBundle = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  status: 'draft' | 'published' | 'archived' | string;
  coverImageUrl: string | null;
  itemsCount: number;
};

type VendorBundleListResponse = {
  data?: VendorBundle[];
  error?: string;
};

type VendorBundleItemsResponse = {
  data?: {
    bundleId: string;
    selectedProductIds: string[];
    availableProducts: AvailableVendorProduct[];
  };
  error?: string;
};

type AvailableVendorProduct = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  coverImageUrl: string | null;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

type CreateFormState = {
  title: string;
  slug: string;
  price: string;
  description: string;
};

type EditFormState = {
  title: string;
  slug: string;
  price: string;
  description: string;
  coverImageUrl: string;
  status: 'draft' | 'published' | 'archived';
};

export function VendorBundlesManager({ locale }: { locale: string }) {
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<VendorBundle[]>([]);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [availableProducts, setAvailableProducts] = useState<AvailableVendorProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    title: '',
    slug: '',
    price: '0',
    description: '',
  });
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    slug: '',
    price: '0',
    description: '',
    coverImageUrl: '',
    status: 'draft',
  });

  const selectedBundle = useMemo(
    () => bundles.find((bundle) => bundle.id === selectedBundleId) ?? null,
    [bundles, selectedBundleId],
  );

  const title = locale === 'fr' ? 'Bundles vendeur' : 'Vendor bundles';
  const subtitle = locale === 'fr'
    ? 'Creez et gerez vos bundles mono-vendeur'
    : 'Create and manage your single-seller bundles';
  const createTitle = locale === 'fr' ? 'Creer un bundle' : 'Create bundle';
  const editTitle = locale === 'fr' ? 'Modifier le bundle' : 'Edit bundle';
  const itemsTitle = locale === 'fr' ? 'Produits inclus' : 'Included products';
  const saveLabel = locale === 'fr' ? 'Enregistrer' : 'Save';
  const savingLabel = locale === 'fr' ? 'Enregistrement...' : 'Saving...';

  async function fetchBundles() {
    setLoadingBundles(true);
    setError(null);

    try {
      const response = await fetch('/api/vendor/bundles', { method: 'GET' });
      const body = await response.json().catch(() => null) as VendorBundleListResponse | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to fetch bundles (${response.status})`);
      }

      const nextBundles = body?.data ?? [];
      setBundles(nextBundles);
      setSelectedBundleId((current) => {
        if (current && nextBundles.some((bundle) => bundle.id === current)) return current;
        return nextBundles[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load bundles');
    } finally {
      setLoadingBundles(false);
    }
  }

  async function fetchBundleItems(bundleId: string) {
    try {
      const response = await fetch(`/api/vendor/bundles/${bundleId}/items`, { method: 'GET' });
      const body = await response.json().catch(() => null) as VendorBundleItemsResponse | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to fetch bundle items (${response.status})`);
      }

      setSelectedProductIds(body?.data?.selectedProductIds ?? []);
      setAvailableProducts(body?.data?.availableProducts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load bundle items');
      setSelectedProductIds([]);
      setAvailableProducts([]);
    }
  }

  useEffect(() => {
    void fetchBundles();
  }, []);

  useEffect(() => {
    if (!selectedBundle) {
      setEditForm({
        title: '',
        slug: '',
        price: '0',
        description: '',
        coverImageUrl: '',
        status: 'draft',
      });
      setSelectedProductIds([]);
      setAvailableProducts([]);
      return;
    }

    setEditForm({
      title: selectedBundle.title,
      slug: selectedBundle.slug,
      price: String(selectedBundle.price),
      description: selectedBundle.description ?? '',
      coverImageUrl: selectedBundle.coverImageUrl ?? '',
      status: selectedBundle.status === 'published' || selectedBundle.status === 'archived'
        ? selectedBundle.status
        : 'draft',
    });

    void fetchBundleItems(selectedBundle.id);
  }, [selectedBundle]);

  async function createBundle() {
    if (!createForm.title.trim()) {
      setError(locale === 'fr' ? 'Le titre est requis.' : 'Title is required.');
      return;
    }
    if (!createForm.slug.trim()) {
      setError(locale === 'fr' ? 'Le slug est requis.' : 'Slug is required.');
      return;
    }

    setSavingCreate(true);
    setError(null);

    try {
      const response = await fetch('/api/vendor/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          slug: createForm.slug.trim(),
          price: Number(createForm.price || '0'),
          description: createForm.description.trim() || null,
          status: 'draft',
        }),
      });

      const body = await response.json().catch(() => null) as { data?: VendorBundle; error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to create bundle (${response.status})`);
      }

      setCreateForm({
        title: '',
        slug: '',
        price: '0',
        description: '',
      });
      await fetchBundles();
      if (body?.data?.id) {
        setSelectedBundleId(body.data.id);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create bundle');
    } finally {
      setSavingCreate(false);
    }
  }

  async function saveBundle() {
    if (!selectedBundle) return;

    setSavingEdit(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendor/bundles/${selectedBundle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          slug: editForm.slug.trim(),
          price: Number(editForm.price || '0'),
          description: editForm.description.trim() || null,
          coverImageUrl: editForm.coverImageUrl.trim() || null,
          status: editForm.status,
        }),
      });

      const body = await response.json().catch(() => null) as { data?: VendorBundle; error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to update bundle (${response.status})`);
      }

      await fetchBundles();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update bundle');
    } finally {
      setSavingEdit(false);
    }
  }

  async function saveIncludedItems() {
    if (!selectedBundle) return;
    setSavingItems(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendor/bundles/${selectedBundle.id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: selectedProductIds,
        }),
      });

      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to save bundle items (${response.status})`);
      }

      await fetchBundles();
      await fetchBundleItems(selectedBundle.id);
    } catch (itemsError) {
      setError(itemsError instanceof Error ? itemsError.message : 'Failed to save bundle items');
    } finally {
      setSavingItems(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-serif font-black text-kode01-noir">{title}</CardTitle>
          <p className="text-sm text-kode01-noir/60">{subtitle}</p>
        </CardHeader>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">{createTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={createForm.title}
              onChange={(event) => {
                const titleValue = event.target.value;
                setCreateForm((current) => ({
                  ...current,
                  title: titleValue,
                  slug: current.slug.trim() ? current.slug : slugify(titleValue),
                }));
              }}
              placeholder={locale === 'fr' ? 'Titre du bundle' : 'Bundle title'}
            />
            <Input
              value={createForm.slug}
              onChange={(event) => setCreateForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
              placeholder="bundle-slug"
            />
            <Input
              value={createForm.price}
              type="number"
              min="0"
              step="0.01"
              onChange={(event) => setCreateForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="0.00"
            />
            <textarea
              value={createForm.description}
              onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
              placeholder={locale === 'fr' ? 'Description (optionnelle)' : 'Description (optional)'}
              className="min-h-28 w-full rounded-xl border border-black/10 px-3 py-2 text-sm text-kode01-noir outline-none focus:border-kode01-pink/70"
            />
            <Button
              type="button"
              onClick={() => {
                void createBundle();
              }}
              disabled={savingCreate}
              className="w-full rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90"
            >
              {savingCreate ? savingLabel : createTitle}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl font-serif font-black text-kode01-noir">
              {locale === 'fr' ? 'Vos bundles' : 'Your bundles'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingBundles ? (
              <p className="text-sm text-kode01-noir/55">{locale === 'fr' ? 'Chargement...' : 'Loading...'}</p>
            ) : bundles.length === 0 ? (
              <p className="text-sm text-kode01-noir/55">
                {locale === 'fr' ? 'Aucun bundle pour le moment.' : 'No bundles yet.'}
              </p>
            ) : (
              bundles.map((bundle) => (
                <button
                  key={bundle.id}
                  type="button"
                  onClick={() => setSelectedBundleId(bundle.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selectedBundleId === bundle.id
                      ? 'border-kode01-pink bg-kode01-pink/10'
                      : 'border-black/10 hover:border-black/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-kode01-noir">{bundle.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={bundle.status === 'published'
                          ? 'border-0 bg-kode01-green/15 text-kode01-green'
                          : bundle.status === 'archived'
                            ? 'border-0 bg-black/10 text-kode01-noir/70'
                            : 'border-0 bg-kode01-blue/15 text-kode01-blue'}
                      >
                        {bundle.status}
                      </Badge>
                      <span className="text-xs font-bold text-kode01-noir/55">
                        {bundle.itemsCount} {locale === 'fr' ? 'items' : 'items'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                    /{bundle.slug}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selectedBundle ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">{editTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={locale === 'fr' ? 'Titre du bundle' : 'Bundle title'}
              />
              <Input
                value={editForm.slug}
                onChange={(event) => setEditForm((current) => ({ ...current, slug: slugify(event.target.value) }))}
                placeholder="bundle-slug"
              />
              <Input
                value={editForm.price}
                type="number"
                min="0"
                step="0.01"
                onChange={(event) => setEditForm((current) => ({ ...current, price: event.target.value }))}
                placeholder="0.00"
              />
              <Input
                value={editForm.coverImageUrl}
                onChange={(event) => setEditForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
                placeholder={locale === 'fr' ? 'URL image de couverture' : 'Cover image URL'}
              />
              <select
                value={editForm.status}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'draft' || value === 'published' || value === 'archived') {
                    setEditForm((current) => ({ ...current, status: value }));
                  }
                }}
                className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm text-kode01-noir outline-none focus:border-kode01-pink/70"
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
              <textarea
                value={editForm.description}
                onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                placeholder={locale === 'fr' ? 'Description' : 'Description'}
                className="min-h-28 w-full rounded-xl border border-black/10 px-3 py-2 text-sm text-kode01-noir outline-none focus:border-kode01-pink/70"
              />
              <Button
                type="button"
                onClick={() => {
                  void saveBundle();
                }}
                disabled={savingEdit}
                className="w-full rounded-full bg-kode01-noir text-white hover:bg-kode01-noir/90"
              >
                {savingEdit ? savingLabel : saveLabel}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">{itemsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {availableProducts.length === 0 ? (
                <p className="text-sm text-kode01-noir/55">
                  {locale === 'fr'
                    ? 'Aucun produit disponible. Creez des produits non-bundle pour les inclure.'
                    : 'No available products. Create non-bundle products to include them.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {availableProducts.map((product) => {
                    const checked = selectedProductIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 px-3 py-2 hover:bg-kode01-cream/30"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedProductIds((current) => (
                              checked
                                ? current.filter((id) => id !== product.id)
                                : [...current, product.id]
                            ));
                          }}
                          className="mt-1 h-4 w-4 rounded border-black/30"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-kode01-noir">{product.title}</span>
                          <span className="block text-xs font-semibold text-kode01-noir/55">
                            ${product.price.toFixed(2)} - {product.status}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                onClick={() => {
                  void saveIncludedItems();
                }}
                disabled={savingItems}
                className="mt-4 w-full rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90"
              >
                {savingItems ? savingLabel : saveLabel}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
