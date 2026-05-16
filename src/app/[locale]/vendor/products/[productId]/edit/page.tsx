import { redirect } from 'next/navigation';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';
import { ProductEditForm } from '@/features/dashboard/components/ProductEditForm';

export default async function EditProductPage(
  props: { params: Promise<{ locale: string; productId: string }> },
) {
  const { locale, productId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_id')
    .eq('id', user.id)
    .single();

  if (!profile || !isSellerRole(profile.role)) {
    redirect(`/${locale}`);
  }

  const { data: product } = await supabase
    .from('products')
    .select(`
      id,
      title,
      description,
      category,
      tags,
      cover_image_url,
      gallery_urls,
      file_path_vault,
      price,
      is_pwyw,
      min_price,
      generates_license_key,
      status
    `)
    .eq('id', productId)
    .eq('seller_id', user.id)
    .maybeSingle();

  if (!product) {
    redirect(`/${locale}/vendor/products`);
  }

  const canPublish = isSellerRole(profile.role)
    && Boolean(profile.stripe_account_id)
    && profile.stripe_charges_enabled === true
    && profile.stripe_payouts_enabled === true;

  return (
    <DashboardShell
      role="vendor"
      locale={locale}
      title="Edit product"
      subtitle="Update product details, pricing, media, files, and publication status."
    >
      <ProductEditForm
        locale={locale}
        canPublish={canPublish}
        product={{
          id: product.id,
          title: product.title,
          description: product.description,
          category: product.category,
          tags: product.tags,
          coverImageUrl: product.cover_image_url,
          galleryUrls: product.gallery_urls,
          filePathVault: product.file_path_vault,
          price: Number(product.price ?? 0),
          isPwyw: Boolean(product.is_pwyw),
          minPrice: product.min_price == null ? null : Number(product.min_price),
          generatesLicenseKey: Boolean(product.generates_license_key),
          status: product.status as 'draft' | 'published' | 'archived',
        }}
      />
    </DashboardShell>
  );
}
