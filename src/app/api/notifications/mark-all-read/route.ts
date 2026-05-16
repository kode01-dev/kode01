import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: nowIso })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notifications mark-all-read error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
