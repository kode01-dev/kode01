import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';
import { revalidateEditorialContent } from '@/lib/cache/revalidate';

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

type SponsoredGroupRow = {
  id: string;
  status: 'draft' | 'published';
  sponsorship_status: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
  is_sponsored: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ translationGroupId: string }> },
) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { translationGroupId } = await context.params;
    if (!translationGroupId) {
      return NextResponse.json({ error: 'Missing translation group id' }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = rejectSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { admin, userId } = adminSession;
    const { data: rows, error: rowsError } = await admin
      .from('editorial_posts')
      .select('id, status, sponsorship_status, is_sponsored')
      .eq('translation_group_id', translationGroupId);

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    const groupRows = (rows ?? []) as SponsoredGroupRow[];
    if (groupRows.length === 0) {
      return NextResponse.json({ error: 'Sponsored submission not found' }, { status: 404 });
    }

    if (groupRows.some((row) => row.is_sponsored !== true)) {
      return NextResponse.json({ error: 'Translation group is not a sponsored submission' }, { status: 400 });
    }

    const statuses = new Set(groupRows.map((row) => row.sponsorship_status));
    if (statuses.has('pending_payment')) {
      return NextResponse.json({ error: 'Submission payment is not completed yet' }, { status: 409 });
    }
    if (!statuses.has('pending_review')) {
      return NextResponse.json({ error: 'Submission is not pending review' }, { status: 409 });
    }

    const hadPublished = groupRows.some((row) => row.status === 'published');
    const nowIso = new Date().toISOString();
    const { error: updateError } = await admin
      .from('editorial_posts')
      .update({
        status: 'draft',
        published_at: null,
        sponsorship_status: 'rejected',
        sponsored_rejected_at: nowIso,
        sponsored_rejected_by: userId,
        sponsored_rejection_reason: parsed.data.reason,
        updated_by: userId,
      })
      .eq('translation_group_id', translationGroupId)
      .eq('is_sponsored', true);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (hadPublished) {
      revalidateEditorialContent();
    }

    return NextResponse.json({ success: true, translationGroupId });
  } catch (error) {
    console.error('POST /api/admin/editorial/sponsored/[translationGroupId]/reject error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
