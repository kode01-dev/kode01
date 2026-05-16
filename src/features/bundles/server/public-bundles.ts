import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicServerClient } from '@/lib/supabase/server-public';

type BundleProductRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | string | null;
  cover_image_url: string | null;
  content_locales: unknown;
  content_source_locale: unknown;
  profiles:
    | {
      display_name: string | null;
      shop_name: string | null;
      avatar_url: string | null;
    }
    | Array<{
      display_name: string | null;
      shop_name: string | null;
      avatar_url: string | null;
    }>
    | null;
};

type BundleItemLinkRow = {
  bundle_id: string;
  product_id: string;
};

type IncludedProductRow = {
  id: string;
  slug: string | null;
  title: string;
  price: number | string | null;
  status: string;
  is_bundle: boolean;
  cover_image_url: string | null;
  content_locales: unknown;
  content_source_locale: unknown;
};

export type BundleSeller = {
  name?: string;
  avatar_url?: string | null;
};

export type BundleIncludedItem = {
  id: string;
  slug: string;
  title: string;
  price: number;
  cover_image_url: string | null;
  content_locales: Array<'fr' | 'en'> | null;
  content_source_locale: 'fr' | 'en' | null;
};

export type PublicBundle = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  cover_image_url: string | null;
  content_locales: Array<'fr' | 'en'> | null;
  content_source_locale: 'fr' | 'en' | null;
  seller?: BundleSeller;
  items_count: number;
  total_original: number;
  discount_percent: number;
  items: BundleIncludedItem[];
};

function createBundlesReadClient() {
  try {
    return createAdminClient();
  } catch {
    return createPublicServerClient();
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toContentLocales(value: unknown): Array<'fr' | 'en'> | null {
  if (!Array.isArray(value)) return null;
  const locales = value.filter((entry): entry is 'fr' | 'en' => entry === 'fr' || entry === 'en');
  return locales.length > 0 ? locales : null;
}

function toSourceLocale(value: unknown): 'fr' | 'en' | null {
  return value === 'fr' || value === 'en' ? value : null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDiscountPercent(totalOriginal: number, bundlePrice: number): number {
  if (!Number.isFinite(totalOriginal) || totalOriginal <= 0) return 0;
  const raw = ((totalOriginal - bundlePrice) / totalOriginal) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

function firstProfile(
  profiles: BundleProductRow['profiles'],
): { display_name: string | null; shop_name: string | null; avatar_url: string | null } | null {
  if (!profiles) return null;
  return Array.isArray(profiles) ? (profiles[0] ?? null) : profiles;
}

function mapBundleSeller(profile: ReturnType<typeof firstProfile>): BundleSeller | undefined {
  if (!profile) return undefined;
  return {
    name: profile.shop_name || profile.display_name || undefined,
    avatar_url: profile.avatar_url,
  };
}

export async function listPublicBundles(): Promise<PublicBundle[]> {
  const supabase = createBundlesReadClient();
  const { data, error } = await supabase
    .from('products')
    .select(
      `
        id,
        title,
        slug,
        description,
        price,
        cover_image_url,
        content_locales,
        content_source_locale,
        profiles:profile_marketplace_data!seller_id (
          display_name,
          shop_name,
          avatar_url
        )
      `,
    )
    .eq('status', 'published')
    .eq('is_bundle', true)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const bundleRows = (data ?? []) as BundleProductRow[];
  if (bundleRows.length === 0) return [];

  const bundleIds = bundleRows.map((row) => row.id);
  const { data: linkData, error: linkError } = await supabase
    .from('product_bundle_items')
    .select('bundle_id, product_id')
    .in('bundle_id', bundleIds);
  if (linkError) throw linkError;
  const links = (linkData ?? []) as BundleItemLinkRow[];

  const itemIds = Array.from(new Set(links.map((row) => row.product_id)));
  let includedProducts = new Map<string, IncludedProductRow>();
  if (itemIds.length > 0) {
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        slug,
        title,
        price,
        status,
        is_bundle,
        cover_image_url,
        content_locales,
        content_source_locale
      `)
      .in('id', itemIds);
    if (productError) throw productError;

    includedProducts = new Map(
      ((productData ?? []) as IncludedProductRow[])
        .filter((row) => row.status === 'published' && row.is_bundle === false)
        .map((row) => [row.id, row]),
    );
  }

  return bundleRows.map((bundle) => {
    const linkedIds = links.filter((entry) => entry.bundle_id === bundle.id).map((entry) => entry.product_id);
    const items = linkedIds
      .map((itemId) => includedProducts.get(itemId))
      .filter((row): row is IncludedProductRow => Boolean(row))
      .map((row) => ({
        id: row.id,
        slug: row.slug ?? '',
        title: row.title,
        price: toNumber(row.price),
        cover_image_url: row.cover_image_url,
        content_locales: toContentLocales(row.content_locales),
        content_source_locale: toSourceLocale(row.content_source_locale),
      }));
    const totalOriginal = roundCurrency(items.reduce((sum, item) => sum + item.price, 0));
    const bundlePrice = toNumber(bundle.price);

    return {
      id: bundle.id,
      title: bundle.title,
      slug: bundle.slug,
      description: bundle.description,
      price: bundlePrice,
      cover_image_url: bundle.cover_image_url,
      content_locales: toContentLocales(bundle.content_locales),
      content_source_locale: toSourceLocale(bundle.content_source_locale),
      seller: mapBundleSeller(firstProfile(bundle.profiles)),
      items_count: items.length,
      total_original: totalOriginal,
      discount_percent: computeDiscountPercent(totalOriginal, bundlePrice),
      items,
    };
  });
}

export async function getPublicBundleBySlug(slug: string): Promise<PublicBundle | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) return null;
  const supabase = createBundlesReadClient();
  const { data: bundleData, error: bundleError } = await supabase
    .from('products')
    .select(
      `
        id,
        title,
        slug,
        description,
        price,
        cover_image_url,
        content_locales,
        content_source_locale,
        profiles:profile_marketplace_data!seller_id (
          display_name,
          shop_name,
          avatar_url
        )
      `,
    )
    .eq('status', 'published')
    .eq('is_bundle', true)
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (bundleError) throw bundleError;
  if (!bundleData) return null;

  const bundle = bundleData as BundleProductRow;

  const { data: linkData, error: linkError } = await supabase
    .from('product_bundle_items')
    .select('bundle_id, product_id')
    .eq('bundle_id', bundle.id);
  if (linkError) throw linkError;
  const links = (linkData ?? []) as BundleItemLinkRow[];

  const itemIds = Array.from(new Set(links.map((row) => row.product_id)));
  let includedProducts = new Map<string, IncludedProductRow>();
  if (itemIds.length > 0) {
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        slug,
        title,
        price,
        status,
        is_bundle,
        cover_image_url,
        content_locales,
        content_source_locale
      `)
      .in('id', itemIds);
    if (productError) throw productError;

    includedProducts = new Map(
      ((productData ?? []) as IncludedProductRow[])
        .filter((row) => row.status === 'published' && row.is_bundle === false)
        .map((row) => [row.id, row]),
    );
  }

  const items = links
    .map((entry) => includedProducts.get(entry.product_id))
    .filter((row): row is IncludedProductRow => Boolean(row))
    .map((row) => ({
      id: row.id,
      slug: row.slug ?? '',
      title: row.title,
      price: toNumber(row.price),
      cover_image_url: row.cover_image_url,
      content_locales: toContentLocales(row.content_locales),
      content_source_locale: toSourceLocale(row.content_source_locale),
    }));
  const totalOriginal = roundCurrency(items.reduce((sum, item) => sum + item.price, 0));
  const bundlePrice = toNumber(bundle.price);

  return {
    id: bundle.id,
    title: bundle.title,
    slug: bundle.slug,
    description: bundle.description,
    price: bundlePrice,
    cover_image_url: bundle.cover_image_url,
    content_locales: toContentLocales(bundle.content_locales),
    content_source_locale: toSourceLocale(bundle.content_source_locale),
    seller: mapBundleSeller(firstProfile(bundle.profiles)),
    items_count: items.length,
    total_original: totalOriginal,
    discount_percent: computeDiscountPercent(totalOriginal, bundlePrice),
    items,
  };
}

export async function listPublicBundlesContainingProduct(productId: string): Promise<PublicBundle[]> {
  const normalizedProductId = productId.trim();
  if (!normalizedProductId) return [];
  const supabase = createBundlesReadClient();

  const { data: matchingLinks, error: matchingLinksError } = await supabase
    .from('product_bundle_items')
    .select('bundle_id')
    .eq('product_id', normalizedProductId);
  if (matchingLinksError) throw matchingLinksError;

  const bundleIds = Array.from(
    new Set(
      (matchingLinks ?? [])
        .map((row) => (row as { bundle_id: string | null }).bundle_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );
  if (bundleIds.length === 0) return [];

  const { data: bundleData, error: bundleError } = await supabase
    .from('products')
    .select(
      `
        id,
        title,
        slug,
        description,
        price,
        cover_image_url,
        content_locales,
        content_source_locale,
        profiles:profile_marketplace_data!seller_id (
          display_name,
          shop_name,
          avatar_url
        )
      `,
    )
    .eq('status', 'published')
    .eq('is_bundle', true)
    .in('id', bundleIds)
    .order('created_at', { ascending: false });
  if (bundleError) throw bundleError;

  const bundles = (bundleData ?? []) as BundleProductRow[];
  if (bundles.length === 0) return [];

  const { data: linkData, error: linkError } = await supabase
    .from('product_bundle_items')
    .select('bundle_id, product_id')
    .in('bundle_id', bundles.map((bundle) => bundle.id));
  if (linkError) throw linkError;
  const links = (linkData ?? []) as BundleItemLinkRow[];

  const itemIds = Array.from(new Set(links.map((row) => row.product_id)));
  let includedProducts = new Map<string, IncludedProductRow>();
  if (itemIds.length > 0) {
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        slug,
        title,
        price,
        status,
        is_bundle,
        cover_image_url,
        content_locales,
        content_source_locale
      `)
      .in('id', itemIds);
    if (productError) throw productError;

    includedProducts = new Map(
      ((productData ?? []) as IncludedProductRow[])
        .filter((row) => row.status === 'published' && row.is_bundle === false)
        .map((row) => [row.id, row]),
    );
  }

  return bundles.map((bundle) => {
    const linkedIds = links
      .filter((entry) => entry.bundle_id === bundle.id)
      .map((entry) => entry.product_id);
    const items = linkedIds
      .map((itemId) => includedProducts.get(itemId))
      .filter((row): row is IncludedProductRow => Boolean(row))
      .map((row) => ({
        id: row.id,
        slug: row.slug ?? '',
        title: row.title,
        price: toNumber(row.price),
        cover_image_url: row.cover_image_url,
        content_locales: toContentLocales(row.content_locales),
        content_source_locale: toSourceLocale(row.content_source_locale),
      }));
    const totalOriginal = roundCurrency(items.reduce((sum, item) => sum + item.price, 0));
    const bundlePrice = toNumber(bundle.price);

    return {
      id: bundle.id,
      title: bundle.title,
      slug: bundle.slug,
      description: bundle.description,
      price: bundlePrice,
      cover_image_url: bundle.cover_image_url,
      content_locales: toContentLocales(bundle.content_locales),
      content_source_locale: toSourceLocale(bundle.content_source_locale),
      seller: mapBundleSeller(firstProfile(bundle.profiles)),
      items_count: items.length,
      total_original: totalOriginal,
      discount_percent: computeDiscountPercent(totalOriginal, bundlePrice),
      items,
    };
  });
}
