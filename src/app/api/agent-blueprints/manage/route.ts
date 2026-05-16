import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { AGENT_LICENSE_TYPES } from '@/features/agent-blueprints/types';
import type { AgentLicenseType } from '@/features/agent-blueprints/types';
import type { Database } from '@/types/database.types';

type BlueprintInsert = Database['public']['Tables']['agent_blueprints']['Insert'];

interface ManageBody {
  product_id: string;
  prompt_content?: string;
  tools_config?: Record<string, unknown> | null;
  manifest?: Record<string, unknown>;
  readme_content?: string;
  license_type?: AgentLicenseType;
}

function isValidJson(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

/**
 * POST /api/agent-blueprints/manage
 *
 * Creates or upserts an agent blueprint for a product.
 * Auth required: must be the seller of the product.
 */
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

    const body = (await req.json()) as ManageBody;

    if (!body.product_id) {
      return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
    }

    // Verify seller ownership
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, seller_id')
      .eq('id', body.product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.seller_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate license_type
    if (body.license_type && !AGENT_LICENSE_TYPES.includes(body.license_type)) {
      return NextResponse.json({ error: 'Invalid license_type' }, { status: 400 });
    }

    // Validate tools_config is valid JSON
    if (body.tools_config !== undefined && body.tools_config !== null && !isValidJson(body.tools_config)) {
      return NextResponse.json({ error: 'tools_config must be valid JSON' }, { status: 400 });
    }

    // Upsert
    const upsertData: BlueprintInsert = {
      product_id: body.product_id,
      ...(body.prompt_content !== undefined && { prompt_content: body.prompt_content }),
      ...(body.tools_config !== undefined && { tools_config: body.tools_config as Database['public']['Tables']['agent_blueprints']['Insert']['tools_config'] }),
      ...(body.manifest !== undefined && { manifest: body.manifest as Database['public']['Tables']['agent_blueprints']['Insert']['manifest'] }),
      ...(body.readme_content !== undefined && { readme_content: body.readme_content }),
      ...(body.license_type !== undefined && { license_type: body.license_type }),
    };

    const { data: result, error: upsertError } = await supabase
      .from('agent_blueprints')
      .upsert(upsertData, { onConflict: 'product_id' })
      .select('id, product_id')
      .single();

    if (upsertError) {
      console.error('Blueprint upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save blueprint' }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'agent_blueprint.manage.upsert',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { product_id: body.product_id, blueprint_id: result.id },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Blueprint manage API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
