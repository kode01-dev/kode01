import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional().default(''),
  locale: z.enum(['all', 'en', 'fr']).default('all'),
  sponsorshipStatus: z.enum(['all', 'none', 'pending_payment', 'pending_review', 'approved', 'rejected']).default('all'),
  publicationStatus: z.enum(['all', 'draft', 'published']).default('all'),
  paymentStatus: z.enum(['all', 'pending', 'paid', 'failed', 'refunded']).default('all'),
});

type SponsoredEditorialRow = {
  id: string;
  translation_group_id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  status: 'draft' | 'published';
  sponsorship_status: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
  is_sponsored: boolean;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_approved_by: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejected_by: string | null;
  sponsored_rejection_reason: string | null;
  sponsored_owner_user_id: string | null;
};

type SponsoredOrderRow = {
  id: string;
  translation_group_id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  stripe_checkout_session_id: string | null;
};

export async function GET(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      locale: searchParams.get('locale') ?? undefined,
      sponsorshipStatus: searchParams.get('sponsorshipStatus') ?? undefined,
      publicationStatus: searchParams.get('publicationStatus') ?? undefined,
      paymentStatus: searchParams.get('paymentStatus') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { admin } = adminSession;
    const { page, pageSize, q, locale, sponsorshipStatus, publicationStatus, paymentStatus } = parsed.data;

    let query = admin
      .from('editorial_posts')
      .select('id, translation_group_id, source_locale, locale, status, sponsorship_status, is_sponsored, title, slug, created_at, updated_at, published_at, sponsored_submitted_at, sponsored_approved_at, sponsored_approved_by, sponsored_rejected_at, sponsored_rejected_by, sponsored_rejection_reason, sponsored_owner_user_id')
      .eq('is_sponsored', true);

    if (locale !== 'all') query = query.eq('locale', locale);
    if (sponsorshipStatus !== 'all') query = query.eq('sponsorship_status', sponsorshipStatus);
    if (publicationStatus !== 'all') query = query.eq('status', publicationStatus);
    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`title.ilike.${pattern},slug.ilike.${pattern}`);
    }

    const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      sponsored_approved_by: string | null;
      sponsored_rejected_at: string | null;
      sponsored_rejected_by: string | null;
      sponsored_rejection_reason: string | null;
      sponsored_owner_user_id: string | null;
      order: SponsoredOrderRow | null;
    }>();

    for (const row of (data ?? []) as SponsoredEditorialRow[]) {
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
          sponsored_approved_by: row.sponsored_approved_by,
          sponsored_rejected_at: row.sponsored_rejected_at,
          sponsored_rejected_by: row.sponsored_rejected_by,
          sponsored_rejection_reason: row.sponsored_rejection_reason,
          sponsored_owner_user_id: row.sponsored_owner_user_id,
          order: null,
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

    const groupIds = Array.from(grouped.keys());
    if (groupIds.length > 0) {
      const { data: orders, error: ordersError } = await admin
        .from('editorial_sponsorship_orders')
        .select('id, translation_group_id, status, amount, currency, created_at, updated_at, stripe_checkout_session_id')
        .in('translation_group_id', groupIds)
        .order('created_at', { ascending: false });

      if (ordersError) {
        return NextResponse.json({ error: ordersError.message }, { status: 500 });
      }

      const latestOrderByGroup = new Map<string, SponsoredOrderRow>();
      for (const row of (orders ?? []) as SponsoredOrderRow[]) {
        if (!latestOrderByGroup.has(row.translation_group_id)) {
          latestOrderByGroup.set(row.translation_group_id, row);
        }
      }

      for (const [groupId, value] of grouped.entries()) {
        value.order = latestOrderByGroup.get(groupId) ?? null;
      }
    }

    let rows = Array.from(grouped.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (paymentStatus !== 'all') {
      rows = rows.filter((row) => row.order?.status === paymentStatus);
    }

    const total = rows.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    rows = rows.slice(from, to);

    return NextResponse.json({ data: rows, total, page, pageSize });
  } catch (error) {
    console.error('GET /api/admin/editorial/sponsored error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
