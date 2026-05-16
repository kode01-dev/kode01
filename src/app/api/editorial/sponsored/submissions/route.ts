import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import { getAppBaseUrl } from '@/lib/env/server';
import { isValidEditorialSlug, normalizeSlug } from '@/features/editorial/lib/slug';
import { ensureOptimizedStorageImageUrl } from '@/lib/images/server/core-image-pipeline';

const SPONSORED_BLOG_PRICE_CAD = 79;

const createPostSchema = z.object({
  locale: z.enum(['en', 'fr']),
  title: z.string().trim().min(1).max(220),
  slug: z.string().trim().min(1).max(180).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  excerpt: z.string().trim().max(600).optional().nullable(),
  content_markdown: z.string().max(200000).optional().default(''),
  cover_image_url: z.string().url().max(1200).optional().nullable(),
  seo_title: z.string().trim().max(220).optional().nullable(),
  seo_description: z.string().trim().max(320).optional().nullable(),
  author_name: z.string().trim().max(120).optional().nullable(),
});

const createSubmissionSchema = z.object({
  locale: z.enum(['en', 'fr']).optional(),
  returnPath: z.string().max(400).optional(),
  posts: z.array(createPostSchema).min(1).max(2),
});

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSponsoredMemberRole(role: string | null | undefined): role is 'buyer' | 'seller' {
  return role === 'buyer' || role === 'seller';
}

function resolveReturnPath(args: {
  value: string | undefined;
  role: 'buyer' | 'seller';
  locale: 'en' | 'fr';
}) {
  const defaultPath = args.role === 'seller'
    ? `/${args.locale}/vendor/sponsored-blog`
    : `/${args.locale}/buyer/sponsored-blog`;

  if (!args.value || !args.value.startsWith('/')) {
    return defaultPath;
  }

  try {
    const parsed = new URL(args.value, 'https://kode01.local');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return defaultPath;
  }
}

function buildCheckoutReturnUrl(args: {
  baseUrl: string;
  returnPath: string;
  status: 'success' | 'cancel';
  translationGroupId: string;
}) {
  const target = new URL(args.returnPath, args.baseUrl);
  target.searchParams.set('sponsored_checkout', args.status);
  target.searchParams.set('translation_group_id', args.translationGroupId);
  return target.toString();
}

type SponsoredSubmissionRow = {
  id: string;
  translation_group_id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  status: 'draft' | 'published';
  sponsorship_status: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejection_reason: string | null;
};

type SponsoredOrderRow = {
  id: string;
  translation_group_id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = profile?.role;
    if (!isSponsoredMemberRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const [postsResult, ordersResult] = await Promise.all([
      admin
        .from('editorial_posts')
        .select('id, translation_group_id, source_locale, locale, status, sponsorship_status, title, slug, created_at, updated_at, published_at, sponsored_submitted_at, sponsored_approved_at, sponsored_rejected_at, sponsored_rejection_reason')
        .eq('is_sponsored', true)
        .eq('sponsored_owner_user_id', user.id)
        .order('created_at', { ascending: false }),
      admin
        .from('editorial_sponsorship_orders')
        .select('id, translation_group_id, status, amount, currency, created_at, updated_at')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);

    if (postsResult.error) {
      return NextResponse.json({ error: postsResult.error.message }, { status: 500 });
    }
    if (ordersResult.error) {
      return NextResponse.json({ error: ordersResult.error.message }, { status: 500 });
    }

    const ordersByGroup = new Map<string, SponsoredOrderRow>();
    for (const row of (ordersResult.data ?? []) as SponsoredOrderRow[]) {
      if (!ordersByGroup.has(row.translation_group_id)) {
        ordersByGroup.set(row.translation_group_id, row);
      }
    }

    const grouped = new Map<string, {
      translation_group_id: string;
      source_locale: 'en' | 'fr';
      title: string;
      slug: string;
      status: 'draft' | 'published';
      sponsorship_status: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
      locales: Array<'en' | 'fr'>;
      created_at: string;
      updated_at: string;
      published_at: string | null;
      sponsored_submitted_at: string | null;
      sponsored_approved_at: string | null;
      sponsored_rejected_at: string | null;
      sponsored_rejection_reason: string | null;
      order: SponsoredOrderRow | null;
    }>();

    for (const row of (postsResult.data ?? []) as SponsoredSubmissionRow[]) {
      const existing = grouped.get(row.translation_group_id);
      if (!existing) {
        grouped.set(row.translation_group_id, {
          translation_group_id: row.translation_group_id,
          source_locale: row.source_locale,
          title: row.title,
          slug: row.slug,
          status: row.status,
          sponsorship_status: row.sponsorship_status,
          locales: [row.locale],
          created_at: row.created_at,
          updated_at: row.updated_at,
          published_at: row.published_at,
          sponsored_submitted_at: row.sponsored_submitted_at,
          sponsored_approved_at: row.sponsored_approved_at,
          sponsored_rejected_at: row.sponsored_rejected_at,
          sponsored_rejection_reason: row.sponsored_rejection_reason,
          order: ordersByGroup.get(row.translation_group_id) ?? null,
        });
        continue;
      }

      if (!existing.locales.includes(row.locale)) {
        existing.locales.push(row.locale);
      }
      if (row.locale === row.source_locale) {
        existing.title = row.title;
        existing.slug = row.slug;
        existing.status = row.status;
        existing.sponsorship_status = row.sponsorship_status;
        existing.published_at = row.published_at;
      }
      if (row.updated_at > existing.updated_at) {
        existing.updated_at = row.updated_at;
      }
      if (row.created_at < existing.created_at) {
        existing.created_at = row.created_at;
      }
    }

    const data = Array.from(grouped.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/editorial/sponsored/submissions error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = profile?.role;
    if (!isSponsoredMemberRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = createSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const localeSet = new Set(parsed.data.posts.map((post) => post.locale));
    if (localeSet.size !== parsed.data.posts.length) {
      return NextResponse.json({ error: 'Each locale can be submitted only once per sponsorship.' }, { status: 400 });
    }

    const sourcePost = parsed.data.posts[0];
    const sourceSlug = normalizeSlug(sourcePost.slug?.trim() || sourcePost.title);
    if (!isValidEditorialSlug(sourceSlug)) {
      return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
    }

    const checkoutLocale = parsed.data.locale ?? sourcePost.locale;
    const returnPath = resolveReturnPath({
      value: parsed.data.returnPath,
      role,
      locale: checkoutLocale,
    });

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const normalizeCoverImage = async (sourceUrl: string | null | undefined, pathLabel: string) => {
      const normalized = normalizeOptionalText(sourceUrl);
      if (!normalized) return null;
      return ensureOptimizedStorageImageUrl({
        admin,
        bucket: 'editorial',
        sourceUrl: normalized,
        pathPrefix: `editorial/${user.id}`,
        pathLabel,
        timeoutMs: 15_000,
      });
    };

    const sourceCoverImageUrl = await normalizeCoverImage(sourcePost.cover_image_url, `sponsored-source-${sourceSlug}`);

    const { data: insertedSource, error: sourceInsertError } = await admin
      .from('editorial_posts')
      .insert({
        source_locale: sourcePost.locale,
        locale: sourcePost.locale,
        status: 'draft',
        slug: sourceSlug,
        category: normalizeOptionalText(sourcePost.category),
        title: sourcePost.title.trim(),
        excerpt: normalizeOptionalText(sourcePost.excerpt),
        content_markdown: sourcePost.content_markdown ?? '',
        cover_image_url: sourceCoverImageUrl,
        seo_title: normalizeOptionalText(sourcePost.seo_title),
        seo_description: normalizeOptionalText(sourcePost.seo_description),
        author_name: normalizeOptionalText(sourcePost.author_name),
        published_at: null,
        created_by: user.id,
        updated_by: user.id,
        is_sponsored: true,
        sponsorship_status: 'pending_payment',
        sponsored_owner_user_id: user.id,
        sponsored_submitted_at: nowIso,
      })
      .select('id, translation_group_id, locale')
      .single();

    if (sourceInsertError || !insertedSource) {
      return NextResponse.json({ error: sourceInsertError?.message ?? 'Unable to create sponsored submission' }, { status: 500 });
    }

    const translationGroupId = insertedSource.translation_group_id as string;

    if (parsed.data.posts.length === 2) {
      const secondPost = parsed.data.posts[1];
      const secondCoverImageUrl = await normalizeCoverImage(
        secondPost.cover_image_url ?? sourcePost.cover_image_url,
        `sponsored-translation-${translationGroupId}-${secondPost.locale}`,
      );

      const { error: translationInsertError } = await admin
        .from('editorial_posts')
        .insert({
          translation_group_id: translationGroupId,
          source_locale: sourcePost.locale,
          locale: secondPost.locale,
          status: 'draft',
          slug: sourceSlug,
          category: normalizeOptionalText(secondPost.category) ?? normalizeOptionalText(sourcePost.category),
          title: secondPost.title.trim(),
          excerpt: normalizeOptionalText(secondPost.excerpt),
          content_markdown: secondPost.content_markdown ?? '',
          cover_image_url: secondCoverImageUrl,
          seo_title: normalizeOptionalText(secondPost.seo_title),
          seo_description: normalizeOptionalText(secondPost.seo_description),
          author_name: normalizeOptionalText(secondPost.author_name) ?? normalizeOptionalText(sourcePost.author_name),
          published_at: null,
          created_by: user.id,
          updated_by: user.id,
          is_sponsored: true,
          sponsorship_status: 'pending_payment',
          sponsored_owner_user_id: user.id,
          sponsored_submitted_at: nowIso,
        });

      if (translationInsertError) {
        await admin.from('editorial_posts').delete().eq('translation_group_id', translationGroupId);
        return NextResponse.json({ error: translationInsertError.message }, { status: 500 });
      }
    }

    const { data: order, error: orderError } = await admin
      .from('editorial_sponsorship_orders')
      .insert({
        translation_group_id: translationGroupId,
        owner_user_id: user.id,
        amount: SPONSORED_BLOG_PRICE_CAD,
        currency: 'cad',
        status: 'pending',
      })
      .select('id')
      .single();

    if (orderError || !order) {
      await admin.from('editorial_posts').delete().eq('translation_group_id', translationGroupId);
      return NextResponse.json({ error: orderError?.message ?? 'Unable to initialize sponsorship order' }, { status: 500 });
    }

    const baseUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      adaptive_pricing: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'cad',
            unit_amount: Math.round(SPONSORED_BLOG_PRICE_CAD * 100),
            product_data: {
              name: 'Sponsored Blog Publication',
              description: 'Sponsored blog submission (admin review required)',
            },
          },
        },
      ],
      success_url: buildCheckoutReturnUrl({
        baseUrl,
        returnPath,
        status: 'success',
        translationGroupId,
      }),
      cancel_url: buildCheckoutReturnUrl({
        baseUrl,
        returnPath,
        status: 'cancel',
        translationGroupId,
      }),
      metadata: {
        kind: 'sponsored_blog',
        translationGroupId,
        ownerUserId: user.id,
        orderId: order.id as string,
      },
    });

    if (!session.url || !session.id) {
      await admin
        .from('editorial_sponsorship_orders')
        .update({ status: 'failed' })
        .eq('id', order.id);
      return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 });
    }

    const { error: orderUpdateError } = await admin
      .from('editorial_sponsorship_orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id);

    if (orderUpdateError) {
      console.error('Unable to persist stripe checkout session for sponsored order:', orderUpdateError);
    }

    return NextResponse.json({
      data: {
        checkoutUrl: session.url,
        checkoutSessionId: session.id,
        translationGroupId,
      },
    });
  } catch (error) {
    console.error('POST /api/editorial/sponsored/submissions error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
