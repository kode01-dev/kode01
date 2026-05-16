import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';

const querySchema = z.object({
  status: z.enum(['pending', 'sent', 'failed', 'skipped']).optional(),
  template: z.string().trim().min(1).optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      template: url.searchParams.get('template') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { supabase } = adminSession;
    const { status, template, userId, from, to, limit, offset } = parsed.data;

    let query = supabase
      .from('notifications')
      .select(
        'id, user_id, template_key, title, message, link, metadata, is_read, read_at, email_to, email_subject, email_status, email_provider, email_provider_message_id, email_error, email_sent_at, created_at',
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('email_status', status);
    if (template) query = query.eq('template_key', template);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: notifications, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = Array.from(
      new Set((notifications ?? []).map((row) => row.user_id).filter((value): value is string => Boolean(value))),
    );
    const profileMap = new Map<string, { display_name: string | null; slug: string | null }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, slug')
        .in('id', userIds);

      for (const profile of profiles ?? []) {
        profileMap.set(profile.id, {
          display_name: profile.display_name ?? null,
          slug: profile.slug ?? null,
        });
      }
    }

    return NextResponse.json({
      notifications: (notifications ?? []).map((row) => ({
        ...row,
        profile: profileMap.get(row.user_id) ?? null,
      })),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Admin controllers notifications GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
