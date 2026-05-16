import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminApiAuthDecision } from '@/app/api/admin/_audit';
import { isAdminRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const NON_BLOCKING_TEMPLATE_ERROR_CODES = new Set(['42P01', 'PGRST202', 'PGRST205']);
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * GET /api/admin/marketing/templates
 * List all marketing templates (admin only)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Check admin role
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      await logAdminApiAuthDecision({
        granted: false,
        request,
        scope: 'admin.marketing.templates',
        reason: 'missing_user',
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!isAdminRole(profile?.role)) {
      await logAdminApiAuthDecision({
        granted: false,
        userId: user.id,
        request,
        scope: 'admin.marketing.templates',
        reason: 'role_not_admin',
        metadata: {
          role: profile?.role ?? null,
        },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
    }

    await logAdminApiAuthDecision({
      granted: true,
      userId: user.id,
      request,
      scope: 'admin.marketing.templates',
    });

    // Fetch templates
    const admin = createAdminClient();
    const { data: templates, error } = await admin
      .from('marketing_templates')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      if (NON_BLOCKING_TEMPLATE_ERROR_CODES.has(error.code ?? '')) {
        console.warn('Marketing templates table is unavailable. Returning empty template list.', {
          code: error.code,
          message: error.message,
        });
        return NextResponse.json({ templates: [] }, { headers: NO_STORE_HEADERS });
      }
      throw error;
    }

    return NextResponse.json({ templates: templates ?? [] }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

