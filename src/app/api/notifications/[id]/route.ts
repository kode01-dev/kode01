import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  isRead: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => null);
    const parsedBody = bodySchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsedBody.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('notifications')
      .update({
        is_read: parsedBody.data.isRead,
        read_at: parsedBody.data.isRead ? nowIso : null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, title, message, link, is_read, created_at, email_status')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({
      notification: {
        id: data.id,
        title: data.title,
        message: data.message,
        link: data.link,
        isRead: data.is_read,
        createdAt: data.created_at,
        emailStatus: data.email_status,
      },
    });
  } catch (error) {
    console.error('Notifications PATCH error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
