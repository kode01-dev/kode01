import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';
import { z } from 'zod';

const createProductSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).max(5).optional(),
  cover_image_url: z.string().url().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  gallery_urls: z.array(z.string().url()).max(6).optional(),
  file_path_vault: z.string().min(1).nullable().optional(),
  file_url: z.string().url().nullable().optional(),
  price: z.number().min(0).default(0),
  is_pwyw: z.boolean().default(false),
  enable_pwyw: z.boolean().default(false),
  min_price: z.number().nullable().optional(),
  generates_license_key: z.boolean().default(false),
  status: z.enum(['published', 'draft']).default('draft'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify seller role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (!profile || !isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const coverImageUrl = data.cover_image_url ?? data.cover_url ?? null;
    const filePathVault = data.file_path_vault ?? null;
    const isPwyw = data.is_pwyw || data.enable_pwyw;

    // Only allow publishing if Stripe is fully set up
    if (data.status === 'published') {
      const canPublish = Boolean(profile.stripe_account_id)
        && profile.stripe_charges_enabled === true
        && profile.stripe_payouts_enabled === true;

      if (!canPublish) {
        return NextResponse.json(
          { error: 'Stripe account must be fully configured to publish products.' },
          { status: 403 },
        );
      }

      if (data.price > 0 && !filePathVault) {
        return NextResponse.json(
          { error: 'A paid published product must have a private vault file or explicit deliverable.' },
          { status: 400 },
        );
      }

      if (!coverImageUrl) {
        return NextResponse.json(
          { error: 'A published product must have a cover image.' },
          { status: 400 },
        );
      }
    }

    // Generate slug from title
    const slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 100)
      + '-' + Date.now().toString(36);

    const { data: product, error: insertError } = await supabase
      .from('products')
      .insert({
        title: data.title,
        description: data.description,
        slug,
        seller_id: user.id,
        category: data.category || null,
        tags: data.tags || [],
        cover_image_url: coverImageUrl,
        gallery_urls: data.gallery_urls || [],
        file_path_vault: filePathVault,
        price: data.price,
        is_pwyw: isPwyw,
        min_price: data.min_price ?? null,
        generates_license_key: data.generates_license_key,
        status: data.status,
      })
      .select('id, slug, status')
      .single();

    if (insertError) {
      console.error('Product insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create product.' }, { status: 500 });
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error('Product creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
