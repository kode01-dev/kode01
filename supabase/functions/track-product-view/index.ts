import { badRequest, internalServerError, isInternalAuthorized, json, methodNotAllowed, unauthorized } from '../_shared/http.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';

const schema = z.object({
  slug: z.string().min(1).max(200),
  ip: z.string().min(1).max(100).optional(),
  userAgent: z.string().min(1).max(512).optional(),
});

function isLikelyBot(userAgent?: string) {
  if (!userAgent) return false;
  return /(bot|crawler|spider|headless|preview|monitor)/i.test(userAgent);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { slug, ip, userAgent } = parsed.data;

  if (isLikelyBot(userAgent)) {
    return json({ success: true, skipped: 'bot' });
  }

  const requesterIp = ip ?? 'unknown';

  try {
    const allowed = await checkRateLimit({
      key: `view:${requesterIp}:${slug}`,
      limit: 20,
      windowSeconds: 60,
    });

    if (!allowed) {
      return json({ success: true, throttled: true });
    }

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!product) return badRequest('Product not found');

    const date = new Date().toISOString().split('T')[0];
    const { error: rpcError } = await supabaseAdmin.rpc('increment_view_count', {
      target_product_id: product.id,
      view_date: date,
    });

    if (rpcError) {
      const { data: existing } = await supabaseAdmin
        .from('product_views')
        .select('id, count')
        .eq('product_id', product.id)
        .eq('view_date', date)
        .single();

      if (existing) {
        await supabaseAdmin
          .from('product_views')
          .update({ count: existing.count + 1 })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin.from('product_views').insert({
          product_id: product.id,
          view_date: date,
          count: 1,
        });
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error('track-product-view error:', error);
    return internalServerError();
  }
});

