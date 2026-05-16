import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSupabaseOrNull } from '@/app/api/admin/ads/_lib';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';

const updateSchema = z.object({
  placements: z
    .array(
      z.object({
        slug: z.enum(['free', 'news', 'newsletter_footer']),
        priceMultiplier: z.number().positive().max(100),
        isActive: z.boolean().optional(),
      }),
    )
    .optional(),
  plans: z
    .array(
      z.object({
        id: z.string().uuid(),
        price: z.number().nonnegative().max(100000).optional(),
        priceUsd: z.number().nonnegative().max(100000).optional(),
        currency: z.string().regex(/^[a-zA-Z]{3}$/).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSupabaseOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const [placementsRes, plansRes] = await Promise.all([
      admin
        .from('ad_placements')
        .select('id, slug, display_name, channel, price_multiplier, is_active')
        .order('slug', { ascending: true }),
      admin
        .from('ad_pricing_plans')
        .select('id, code, name, duration_days, price, price_usd, currency, is_active')
        .order('duration_days', { ascending: true }),
    ]);

    if (placementsRes.error || plansRes.error) {
      return NextResponse.json(
        { error: placementsRes.error?.message ?? plansRes.error?.message ?? 'Failed to load plans' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        placements: placementsRes.data ?? [],
        plans: plansRes.data ?? [],
      },
    });
  } catch (error) {
    console.error('Get ad plans error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  try {
    const adminSession = await getAdminSupabaseOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'ads.plans.update.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'ads.plans.update.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();

    // Optimization: Execute DB updates concurrently instead of sequentially inside a for loop
    await Promise.all((parsed.data.placements ?? []).map((placement) =>
      admin
        .from('ad_placements')
        .update({
          price_multiplier: placement.priceMultiplier,
          ...(typeof placement.isActive === 'boolean' ? { is_active: placement.isActive } : {}),
        })
        .eq('slug', placement.slug)
    ));

    // Optimization: Execute DB updates concurrently
    await Promise.all((parsed.data.plans ?? []).map((plan) => {
      const resolvedPrice = typeof plan.price === 'number' ? plan.price : plan.priceUsd;
      const updatePayload: Record<string, unknown> = {};
      if (typeof resolvedPrice === 'number') {
        updatePayload.price = resolvedPrice;
        updatePayload.price_usd = resolvedPrice;
      }
      if (typeof plan.currency === 'string') {
        updatePayload.currency = plan.currency.toLowerCase();
      }
      if (typeof plan.isActive === 'boolean') {
        updatePayload.is_active = plan.isActive;
      }
      if (Object.keys(updatePayload).length === 0) return Promise.resolve();

      return admin
        .from('ad_pricing_plans')
        .update(updatePayload)
        .eq('id', plan.id);
    }));

    await logAuditEvent({
      eventType: 'ads.plans.update.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        placements_updated: (parsed.data.placements ?? []).length,
        plans_updated: (parsed.data.plans ?? []).length,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update ad plans error:', error);
    await logAuditEvent({
      eventType: 'ads.plans.update.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
