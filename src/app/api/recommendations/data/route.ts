import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
  LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
} from '@/features/cookies/lib/consent';

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from('recommendation_events')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Failed to delete recommendation events:', deleteError);
      return NextResponse.json({ error: 'Failed to delete recommendation data' }, { status: 500 });
    }

    const admin = createAdminClient();
    const { error: auditError } = await admin.rpc('log_audit_event', {
      p_event_type: 'recommendation_data_deleted',
      p_user_id: user.id,
      p_metadata: {
        scope: 'user_tracking',
        trigger: 'settings_manual_delete',
      },
    });

    if (auditError) {
      console.error('Failed to write audit log for recommendation data deletion:', auditError);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      name: ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
      value: '',
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });
    response.cookies.set({
      name: LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
      value: '',
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('Recommendation data delete route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
