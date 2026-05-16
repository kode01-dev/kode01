import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';
import { revalidateEditorialContent } from '@/lib/cache/revalidate';

const bulkSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'delete']),
  postIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { admin: supabase } = adminSession;
    const body = await request.json();
    const parsed = bulkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, postIds } = parsed.data;
    let successCount = 0;
    const errors: { id: string; reason: string }[] = [];

    if (action === 'publish') {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('editorial_posts')
        .update({ status: 'published', published_at: now, updated_at: now })
        .in('id', postIds)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      successCount = data?.length ?? 0;
    } else if (action === 'unpublish') {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('editorial_posts')
        .update({ status: 'draft', published_at: null, updated_at: now })
        .in('id', postIds)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      successCount = data?.length ?? 0;
    } else if (action === 'delete') {
      const { data, error } = await supabase
        .from('editorial_posts')
        .delete()
        .in('id', postIds)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      successCount = data?.length ?? 0;
    }

    const failed = postIds.length - successCount;
    if (failed > 0) {
      errors.push({ id: 'unknown', reason: `${failed} post(s) could not be processed` });
    }

    if (successCount > 0 && (action === 'publish' || action === 'unpublish' || action === 'delete')) {
      revalidateEditorialContent();
    }

    return NextResponse.json({ success: successCount, failed, errors });
  } catch (err) {
    console.error('[editorial/bulk-actions] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
