import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getBlueprintFullContent } from '@/features/agent-blueprints/server/repository';

/**
 * GET /api/agent-blueprints/[productId]/content
 *
 * Returns the full protected blueprint content (prompt_content, tools_config).
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
        eventType: 'agent_blueprint.content.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { product_id: productId },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    // Verify purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id')
      .eq('product_id', productId)
      .eq('buyer_id', user.id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();

    if (purchaseError || !purchase) {
      // Also allow seller access
      const { data: product } = await supabase
        .from('products')
        .select('seller_id')
        .eq('id', productId)
        .single();

      if (!product || product.seller_id !== user.id) {
        await logAuditEvent({
          eventType: 'agent_blueprint.content.failed.forbidden',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { product_id: productId },
        });
        return NextResponse.json(
          { error: 'Forbidden. You must purchase this blueprint to access its content.' },
          { status: 403 },
        );
      }
    }

    const content = await getBlueprintFullContent(supabase, productId);

    if (!content) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    await logAuditEvent({
      eventType: 'agent_blueprint.content.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { product_id: productId },
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('Blueprint content API error:', error);
    await logAuditEvent({
      eventType: 'agent_blueprint.content.failed.internal_error',
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
