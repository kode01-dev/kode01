import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['all', 'queued', 'running', 'succeeded', 'failed', 'dead_letter']).default('all'),
});

type RunRow = Database['public']['Tables']['seo_blog_agent_runs']['Row'];

type EditorialLite = {
  id: string;
  slug: string;
  title: string;
  locale: string;
};

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request, 'admin.seo-blog-agent.runs');
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { page, pageSize, status } = parsed.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const admin = createAdminClient();

    let query = admin
      .from('seo_blog_agent_runs')
      .select(
        'id, job_id, profile_id, mode, status, input, node_statuses, output_outline, qa_report, sources_used, error_message, editorial_post_id, started_at, finished_at, created_at, updated_at',
        { count: 'exact' },
      );
    if (status !== 'all') query = query.eq('status', status);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const runs = (data ?? []) as RunRow[];
    const postIds = Array.from(new Set(runs.map((run) => run.editorial_post_id).filter((id): id is string => Boolean(id))));
    let postMap = new Map<string, EditorialLite>();
    if (postIds.length > 0) {
      const { data: posts, error: postsError } = await admin
        .from('editorial_posts')
        .select('id, slug, title, locale')
        .in('id', postIds);
      if (postsError) {
        return NextResponse.json({ error: postsError.message }, { status: 500 });
      }
      postMap = new Map((posts ?? []).map((post) => [post.id, post as EditorialLite]));
    }

    return NextResponse.json({
      data: runs.map((run) => ({
        ...run,
        editorial_post: run.editorial_post_id ? postMap.get(run.editorial_post_id) ?? null : null,
      })),
      page,
      pageSize,
      total: count ?? runs.length,
    });
  } catch (error) {
    console.error('GET /api/admin/seo-blog-agent/runs error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
