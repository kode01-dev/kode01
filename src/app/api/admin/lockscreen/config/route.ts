import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { normalizeLockscreenConfig } from '@/features/site-lockscreen/lib/lockscreen-config';

const updateConfigSchema = z.object({
  is_enabled: z.boolean(),
  auth_gate_enabled: z.boolean(),
  title_en: z.string().trim().min(1, 'English title is required'),
  title_fr: z.string().trim().min(1, 'French title is required'),
  message_en: z.string().trim().min(1, 'English message is required'),
  message_fr: z.string().trim().min(1, 'French message is required'),
  newsletter_enabled: z.boolean(),
  newsletter_title_en: z.string().trim().min(1, 'English newsletter title is required'),
  newsletter_title_fr: z.string().trim().min(1, 'French newsletter title is required'),
  newsletter_cta_en: z.string().trim().min(1, 'English newsletter CTA is required'),
  newsletter_cta_fr: z.string().trim().min(1, 'French newsletter CTA is required'),
});

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type MaybeSingleBuilder<T> = {
  order?: (column: string, options?: { ascending?: boolean }) => MaybeSingleBuilder<T>;
  limit?: (count: number) => MaybeSingleBuilder<T>;
  maybeSingle?: () => Promise<QueryResult<T>>;
  single?: () => Promise<QueryResult<T>>;
};

const ADMIN_LOCKSCREEN_SELECT = `
        id,
        is_enabled,
        auth_gate_enabled,
        title_en,
        title_fr,
        message_en,
        message_fr,
        newsletter_enabled,
        newsletter_title_en,
        newsletter_title_fr,
        newsletter_cta_en,
        newsletter_cta_fr,
        created_at,
        updated_at,
        updated_by
      `;

const ADMIN_LOCKSCREEN_SELECT_LEGACY = `
        id,
        is_enabled,
        title_en,
        title_fr,
        message_en,
        message_fr,
        newsletter_enabled,
        newsletter_title_en,
        newsletter_title_fr,
        newsletter_cta_en,
        newsletter_cta_fr,
        created_at,
        updated_at,
        updated_by
      `;

function hasMissingAuthGateColumnError(error: { message: string } | null): boolean {
  return typeof error?.message === 'string' && error.message.includes('auth_gate_enabled');
}

async function readSingleRow<T>(builder: MaybeSingleBuilder<T>): Promise<QueryResult<T>> {
  const orderedBuilder =
    typeof builder.order === 'function'
      ? builder.order('updated_at', { ascending: false }).limit?.(1) ?? builder
      : builder;

  if (typeof orderedBuilder.maybeSingle === 'function') {
    return orderedBuilder.maybeSingle();
  }

  if (typeof orderedBuilder.single === 'function') {
    return orderedBuilder.single();
  }

  return { data: null, error: { message: 'Invalid query builder' } };
}

/**
 * GET /api/admin/lockscreen/config
 * Fetch lockscreen configuration (admin only)
 * Returns admin-editable fields only (never returns password hash)
 */
export async function GET(request: Request) {
  const session = await getAdminSessionOrNull(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { supabase } = session;
    const query = supabase
      .from('site_lockscreen_config')
      .select(ADMIN_LOCKSCREEN_SELECT) as unknown as MaybeSingleBuilder<Record<string, unknown>>;

    let { data, error } = await readSingleRow(query);

    if (hasMissingAuthGateColumnError(error)) {
      const legacyQuery = supabase
        .from('site_lockscreen_config')
        .select(ADMIN_LOCKSCREEN_SELECT_LEGACY) as unknown as MaybeSingleBuilder<Record<string, unknown>>;
      const legacyResult = await readSingleRow(legacyQuery);
      data = legacyResult.data ? { ...legacyResult.data, auth_gate_enabled: false } : legacyResult.data;
      error = legacyResult.error;
    }

    if (error) {
      console.error('Error fetching lockscreen config:', error);
      return NextResponse.json(
        { error: 'Failed to fetch configuration' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    const normalizedConfig = normalizeLockscreenConfig(data);

    return NextResponse.json({
      config: {
        ...data,
        ...normalizedConfig,
      },
    });
  } catch (error) {
    console.error('Unexpected error fetching lockscreen config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/lockscreen/config
 * Update lockscreen configuration (admin only)
 * Does not update password (use set-password endpoint for that)
 */
export async function PATCH(request: Request) {
  const session = await getAdminSessionOrNull(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = updateConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { supabase, userId } = session;

    // Get the first (and only) row's ID
    const idQuery = supabase
      .from('site_lockscreen_config')
      .select('id') as unknown as MaybeSingleBuilder<{ id: string }>;
    const { data: configRow } = await readSingleRow(idQuery);

    if (!configRow) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    // Update configuration
    let { error } = await supabase
      .from('site_lockscreen_config')
      .update({
        ...parsed.data,
        updated_by: userId,
      })
      .eq('id', configRow.id);

    if (hasMissingAuthGateColumnError(error)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { auth_gate_enabled: _, ...legacyPayload } = parsed.data;
      const legacyUpdate = await supabase
        .from('site_lockscreen_config')
        .update({
          ...legacyPayload,
          updated_by: userId,
        })
        .eq('id', configRow.id);
      error = legacyUpdate.error;
    }

    if (error) {
      console.error('Error updating lockscreen config:', error);
      return NextResponse.json(
        { error: 'Failed to update configuration' },
        { status: 500 }
      );
    }

    revalidateTag('lockscreen-config', 'default');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error updating lockscreen config:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
