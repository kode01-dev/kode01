import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import type { Database } from '@/types/database.types';

type BlueprintUpdate = Database['public']['Tables']['agent_blueprints']['Update'];
const vetBodySchema = z.object({
  blueprint_id: z.string().uuid(),
  is_vetted: z.boolean(),
}).strict();

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch blueprints with basic columns
    const { data: blueprints, error: listError } = await supabase
      .from('agent_blueprints')
      .select('id, product_id, manifest, license_type, is_vetted, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (listError) {
      console.error('Blueprint list error', {
        code: listError.code ?? null,
        message: listError.message ?? 'unknown',
      });
      return NextResponse.json({ error: 'Failed to load blueprints' }, { status: 500 });
    }

    // Enrich with product + seller info
    const productIds = (blueprints ?? []).map((bp) => bp.product_id);
    const { data: products } = productIds.length > 0
      ? await supabase
          .from('products')
          .select('id, title, seller_id, profiles!seller_id ( display_name, shop_name )')
          .in('id', productIds)
      : { data: [] as { id: string; title: string; seller_id: string; profiles: { display_name: string | null; shop_name: string | null } | null }[] };

    const productMap = new Map<string, { title: string; seller_name: string | null }>();
    for (const p of products ?? []) {
      const seller = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      productMap.set(p.id, {
        title: p.title,
        seller_name: seller?.shop_name ?? seller?.display_name ?? null,
      });
    }

    const mapped = (blueprints ?? []).map((bp) => {
      const productInfo = productMap.get(bp.product_id);
      return {
        id: bp.id,
        product_id: bp.product_id,
        manifest: bp.manifest,
        license_type: bp.license_type,
        is_vetted: bp.is_vetted,
        created_at: bp.created_at,
        product_title: productInfo?.title ?? null,
        seller_name: productInfo?.seller_name ?? null,
      };
    });

    return NextResponse.json({ blueprints: mapped });
  } catch (error) {
    console.error('Blueprint list API error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = vetBodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'blueprint_id and is_vetted (boolean) are required' },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const updateData: BlueprintUpdate = {
      is_vetted: body.is_vetted,
      vetted_by: body.is_vetted ? user.id : null,
      vetted_at: body.is_vetted ? new Date().toISOString() : null,
    };

    const { error: updateError } = await supabase
      .from('agent_blueprints')
      .update(updateData)
      .eq('id', body.blueprint_id);

    if (updateError) {
      console.error('Blueprint vet update error', {
        code: updateError.code ?? null,
        message: updateError.message ?? 'unknown',
      });
      return NextResponse.json({ error: 'Failed to update vetting status' }, { status: 500 });
    }

    await logAuditEvent({
      eventType: body.is_vetted
        ? 'agent_blueprint.vet.approved'
        : 'agent_blueprint.vet.revoked',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { blueprint_id: body.blueprint_id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blueprint vet API error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
