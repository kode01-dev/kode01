import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database.types';

const profileSelect =
  'id, name, description, status, version, base_profile_id, nodes_config, run_config, created_by, updated_by, activated_at, created_at, updated_at';

type ProfileInsert = Database['public']['Tables']['seo_blog_agent_profiles']['Insert'];
type ProfileUpdate = Database['public']['Tables']['seo_blog_agent_profiles']['Update'];
type ProfileRow = Database['public']['Tables']['seo_blog_agent_profiles']['Row'];

const jsonRecordSchema = z.record(z.string(), z.unknown());

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  sourceProfileId: z.string().uuid().optional(),
  nodes_config: jsonRecordSchema.optional(),
  run_config: jsonRecordSchema.optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['save', 'activate', 'archive', 'rollback']).default('save'),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  nodes_config: jsonRecordSchema.optional(),
  run_config: jsonRecordSchema.optional(),
});

function asJson(value: Record<string, unknown> | undefined): Json | undefined {
  return value as Json | undefined;
}

async function fetchProfiles() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('seo_blog_agent_profiles')
    .select(profileSelect)
    .order('status', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  const profiles = (data ?? []) as ProfileRow[];
  return {
    profiles,
    activeProfile: profiles.find((profile) => profile.status === 'active') ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request, 'admin.seo-blog-agent.profile');
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(await fetchProfiles());
  } catch (error) {
    console.error('GET /api/admin/seo-blog-agent/profile error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request, 'admin.seo-blog-agent.profile');
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    let source: ProfileRow | null = null;
    if (parsed.data.sourceProfileId) {
      const { data, error } = await admin
        .from('seo_blog_agent_profiles')
        .select(profileSelect)
        .eq('id', parsed.data.sourceProfileId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      source = (data as ProfileRow | null) ?? null;
    } else {
      const { activeProfile } = await fetchProfiles();
      source = activeProfile;
    }

    const nextVersion = (source?.version ?? 0) + 1;
    const insertPayload: ProfileInsert = {
      name: parsed.data.name ?? `${source?.name ?? 'SEO Blog Writer'} v${nextVersion}`,
      description: parsed.data.description ?? source?.description ?? null,
      status: 'draft',
      version: nextVersion,
      base_profile_id: source?.id ?? null,
      nodes_config: asJson(parsed.data.nodes_config) ?? source?.nodes_config ?? {},
      run_config: asJson(parsed.data.run_config) ?? source?.run_config ?? {},
      created_by: adminSession.userId,
      updated_by: adminSession.userId,
    };

    const { data, error } = await admin
      .from('seo_blog_agent_profiles')
      .insert(insertPayload)
      .select(profileSelect)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to create profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/seo-blog-agent/profile error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request, 'admin.seo-blog-agent.profile');
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { id, action } = parsed.data;

    if (action === 'activate' || action === 'rollback') {
      const { error: archiveError } = await admin
        .from('seo_blog_agent_profiles')
        .update({ status: 'archived', updated_by: adminSession.userId })
        .eq('status', 'active')
        .neq('id', id);
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });

      const { data, error } = await admin
        .from('seo_blog_agent_profiles')
        .update({
          status: 'active',
          activated_at: new Date().toISOString(),
          updated_by: adminSession.userId,
        })
        .eq('id', id)
        .select(profileSelect)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'Unable to activate profile' }, { status: 500 });
      }
      return NextResponse.json({ profile: data });
    }

    if (action === 'archive') {
      const { data, error } = await admin
        .from('seo_blog_agent_profiles')
        .update({ status: 'archived', updated_by: adminSession.userId })
        .eq('id', id)
        .select(profileSelect)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'Unable to archive profile' }, { status: 500 });
      }
      return NextResponse.json({ profile: data });
    }

    const updatePayload: ProfileUpdate = {
      updated_by: adminSession.userId,
    };
    if (typeof parsed.data.name === 'string') updatePayload.name = parsed.data.name;
    if (typeof parsed.data.description === 'string' || parsed.data.description === null) {
      updatePayload.description = parsed.data.description;
    }
    if (parsed.data.nodes_config) updatePayload.nodes_config = asJson(parsed.data.nodes_config);
    if (parsed.data.run_config) updatePayload.run_config = asJson(parsed.data.run_config);

    const { data, error } = await admin
      .from('seo_blog_agent_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select(profileSelect)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to update profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('PATCH /api/admin/seo-blog-agent/profile error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
