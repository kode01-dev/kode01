import { NextResponse } from 'next/server';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const NON_BLOCKING_TEMPLATE_ERROR_CODES = new Set(['42P01', 'PGRST202', 'PGRST205']);
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notification_templates')
      .select(
        'key, name, description, subject_en, subject_fr, message_en, message_fr, email_enabled, in_app_enabled, push_enabled, is_active, created_at, updated_at',
      )
      .order('key', { ascending: true });

    if (error) {
      if (NON_BLOCKING_TEMPLATE_ERROR_CODES.has(error.code ?? '')) {
        console.warn('Notification templates table is unavailable. Returning empty template list.', {
          code: error.code,
          message: error.message,
        });
        return NextResponse.json({ templates: [] }, { headers: NO_STORE_HEADERS });
      }
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    return NextResponse.json({ templates: data ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin controllers templates GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
