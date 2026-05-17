import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';
import { isOptionalSellerVaultPath } from '@/lib/vendor/vault-path';

const updateProductSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).max(8).optional(),
  cover_image_url: z.string().url().nullable().optional(),
  gallery_urls: z.array(z.string().url()).max(8).optional(),
  file_path_vault: z.string().min(1).nullable().optional(),
  price: z.number().min(0).optional(),
  is_pwyw: z.boolean().optional(),
  min_price: z.number().nullable().optional(),
  generates_license_key: z.boolean().optional(),
  status: z.enum(['published', 'draft', 'archived']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (!profile || !isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('products')
      .select('id, seller_id, price, status, cover_image_url, file_path_vault')
      .eq('id', productId)
      .eq('seller_id', user.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const parsed = updateProductSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const nextStatus = parsed.data.status ?? existing.status;
    const nextPrice = parsed.data.price ?? Number(existing.price ?? 0);
    const nextCover = parsed.data.cover_image_url !== undefined
      ? parsed.data.cover_image_url
      : existing.cover_image_url;
    const nextVaultPath = parsed.data.file_path_vault !== undefined
      ? parsed.data.file_path_vault
      : existing.file_path_vault;

    if (!isOptionalSellerVaultPath(nextVaultPath, user.id)) {
      return NextResponse.json(
        { error: 'Invalid private file path for this seller.' },
        { status: 400 },
      );
    }

    if (nextStatus === 'published') {
      const canPublish = Boolean(profile.stripe_account_id)
        && profile.stripe_charges_enabled === true
        && profile.stripe_payouts_enabled === true;

      if (!canPublish) {
        return NextResponse.json(
          { error: 'Stripe account must be fully configured to publish products.' },
          { status: 403 },
        );
      }

      if (nextPrice > 0 && !nextVaultPath) {
        return NextResponse.json(
          { error: 'A paid published product must have a private vault file or explicit deliverable.' },
          { status: 400 },
        );
      }

      if (!nextCover) {
        return NextResponse.json(
          { error: 'A published product must have a cover image.' },
          { status: 400 },
        );
      }
    }

    const updatePayload = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );

    const { data: product, error: updateError } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', productId)
      .eq('seller_id', user.id)
      .select('id, slug, status')
      .single();

    if (updateError) {
      console.error('Product update error:', updateError);
      return NextResponse.json({ error: 'Failed to update product.' }, { status: 500 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error('Product update route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
