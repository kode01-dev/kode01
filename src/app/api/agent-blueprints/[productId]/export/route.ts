import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getBlueprintFullContent } from '@/features/agent-blueprints/server/repository';
import type { AgentBlueprintExport } from '@/features/agent-blueprints/types';

/**
 * GET /api/agent-blueprints/[productId]/export
 *
 * Returns the full blueprint as a downloadable JSON file.
 * Requires authentication and a verified purchase.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  let productId: string | null = null;

  try {
    ({ productId } = await params);

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await logAuditEvent({
        eventType: 'agent_blueprint.export.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { product_id: productId },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    // Verify purchase or seller ownership
    const { data: purchase } = await supabase
      .from('purchases')
      .select('id')
      .eq('product_id', productId)
      .eq('buyer_id', user.id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();

    if (!purchase) {
      const { data: product } = await supabase
        .from('products')
        .select('seller_id')
        .eq('id', productId)
        .single();

      if (!product || product.seller_id !== user.id) {
        await logAuditEvent({
          eventType: 'agent_blueprint.export.failed.forbidden',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { product_id: productId },
        });
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Fetch product slug for filename
    const { data: productRow } = await supabase
      .from('products')
      .select('slug')
      .eq('id', productId)
      .single();

    const content = await getBlueprintFullContent(supabase, productId);

    if (!content) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    const exportData: AgentBlueprintExport = {
      schema_version: '1.0',
      manifest: content.manifest,
      system_prompt: content.prompt_content,
      tools: content.tools_config,
      readme: content.readme_content,
      license: content.license_type,
      exported_at: new Date().toISOString(),
    };

    const filename = `blueprint-${productRow?.slug ?? productId}.json`;

    await logAuditEvent({
      eventType: 'agent_blueprint.export.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { product_id: productId },
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Blueprint export API error:', error);
    await logAuditEvent({
      eventType: 'agent_blueprint.export.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        product_id: productId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
