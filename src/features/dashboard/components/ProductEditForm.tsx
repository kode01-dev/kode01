'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUpload, type UploadedFile, ACCEPTED_FILE_TYPES, ACCEPTED_IMAGE_TYPES } from '@/components/ui/file-upload';

type ProductEditInitialData = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  coverImageUrl: string | null;
  galleryUrls: string[] | null;
  filePathVault: string | null;
  price: number;
  isPwyw: boolean;
  minPrice: number | null;
  generatesLicenseKey: boolean;
  status: 'draft' | 'published' | 'archived';
};

type ProductEditFormProps = {
  locale: string;
  canPublish: boolean;
  product: ProductEditInitialData;
};

async function uploadFile(file: File, kind: 'cover' | 'gallery' | 'digital_file'): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);
  const response = await fetch('/api/vendor/uploads', { method: 'POST', body: formData });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }
  const data = await response.json();
  return {
    url: data.url ?? data.publicUrl ?? `${data.bucket}:${data.path}`,
    name: data.name ?? file.name,
    size: data.size ?? file.size,
    type: data.type ?? file.type,
    bucket: data.bucket,
    path: data.path,
    kind: data.kind ?? kind,
  };
}

export function ProductEditForm({ locale, canPublish, product }: ProductEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? '');
  const [category, setCategory] = useState(product.category ?? '');
  const [tags, setTags] = useState((product.tags ?? []).join(', '));
  const [coverImage, setCoverImage] = useState<UploadedFile | null>(
    product.coverImageUrl
      ? { url: product.coverImageUrl, name: 'Current cover', size: 0, type: 'image/*', kind: 'cover' }
      : null,
  );
  const [galleryImages, setGalleryImages] = useState<UploadedFile[]>(
    (product.galleryUrls ?? []).map((url, index) => ({
      url,
      name: `Gallery image ${index + 1}`,
      size: 0,
      type: 'image/*',
      kind: 'gallery',
    })),
  );
  const [productFile, setProductFile] = useState<UploadedFile | null>(
    product.filePathVault
      ? {
          url: `vault:${product.filePathVault}`,
          path: product.filePathVault,
          name: product.filePathVault.split('/').pop() ?? 'Current file',
          size: 0,
          type: 'application/octet-stream',
          kind: 'digital_file',
        }
      : null,
  );
  const [price, setPrice] = useState(String(product.price ?? 0));
  const [isPwyw, setIsPwyw] = useState(product.isPwyw);
  const [minPrice, setMinPrice] = useState(product.minPrice == null ? '' : String(product.minPrice));
  const [generatesLicenseKey, setGeneratesLicenseKey] = useState(product.generatesLicenseKey);
  const [status, setStatus] = useState(product.status);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTags = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    [tags],
  );

  async function saveProduct(nextStatus = status) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendor/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          tags: parsedTags,
          cover_image_url: coverImage?.url ?? null,
          gallery_urls: galleryImages.map((image) => image.url).filter(Boolean),
          file_path_vault: productFile?.path ?? null,
          price: price ? Number(price) : 0,
          is_pwyw: isPwyw,
          min_price: minPrice ? Number(minPrice) : null,
          generates_license_key: generatesLicenseKey,
          status: nextStatus,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(payload.error || 'Save failed');
      }

      router.push(`/${locale}/vendor/products`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="border-black/5 bg-kode01-white rounded-[24px] shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl font-black text-kode01-noir">Product details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={8}
              className="min-h-40 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-kode01-pink"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={category} onChange={(event) => setCategory(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minPrice">Minimum PWYW price</Label>
              <Input id="minPrice" type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-kode01-noir">
              <input type="checkbox" checked={isPwyw} onChange={(event) => setIsPwyw(event.target.checked)} />
              Pay what you want
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-black/10 px-4 py-3 text-sm font-bold text-kode01-noir">
              <input type="checkbox" checked={generatesLicenseKey} onChange={(event) => setGeneratesLicenseKey(event.target.checked)} />
              Auto license keys
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-black/5 bg-kode01-white rounded-[24px] shadow-sm">
          <CardHeader>
            <CardTitle className="font-serif text-lg font-black text-kode01-noir">Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FileUpload
              label="Cover"
              accept={ACCEPTED_IMAGE_TYPES}
              onUpload={(file) => uploadFile(file, 'cover')}
              onChange={(files: UploadedFile[]) => setCoverImage(files.at(-1) ?? null)}
              value={coverImage ? [coverImage] : []}
            />
            <FileUpload
              label="Gallery"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              onUpload={(file) => uploadFile(file, 'gallery')}
              onChange={(files: UploadedFile[]) => setGalleryImages(files.slice(-6))}
              value={galleryImages}
            />
            <FileUpload
              label="Digital file"
              accept={ACCEPTED_FILE_TYPES}
              onUpload={(file) => uploadFile(file, 'digital_file')}
              onChange={(files: UploadedFile[]) => setProductFile(files.at(-1) ?? null)}
              value={productFile ? [productFile] : []}
            />
          </CardContent>
        </Card>

        <Card className="border-black/5 bg-kode01-white rounded-[24px] shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ProductEditInitialData['status'])}
                className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm font-bold outline-none"
              >
                <option value="draft">Draft</option>
                <option value="published" disabled={!canPublish}>Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p> : null}
            <div className="grid gap-2">
              <Button type="button" onClick={() => void saveProduct(status)} disabled={isSaving} className="gap-2 rounded-full bg-kode01-pink font-bold text-kode01-white">
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={() => void saveProduct('published')} disabled={isSaving || !canPublish} className="gap-2 rounded-full font-bold">
                <UploadCloud size={16} />
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
