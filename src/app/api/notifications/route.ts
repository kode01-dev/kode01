import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      unreadOnly: url.searchParams.get('unreadOnly') ?? undefined,
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

    const { limit, offset, unreadOnly } = parsed.data;
    let query = supabase
      .from('notifications')
      .select('id, title, message, link, is_read, created_at, email_status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (unreadError) {
      return NextResponse.json({ error: unreadError.message }, { status: 500 });
    }

    return NextResponse.json({
      notifications: (notifications ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        link: row.link,
        isRead: row.is_read,
        createdAt: row.created_at,
        emailStatus: row.email_status,
      })),
      unreadCount: unreadCount ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
