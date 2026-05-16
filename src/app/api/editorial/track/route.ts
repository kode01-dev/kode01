import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip';

const trackSchema = z.object({
  postId: z.string().uuid(),
  event: z.enum(['view', 'click']),
});

// Simple in-memory rate limiter: 1 event per IP per article per minute
const rateMap = new Map<string, number>();

let lastCleanup = Date.now();
function cleanupRateMap() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  const cutoff = now - 60_000;
  for (const [key, ts] of rateMap) {
    if (ts < cutoff) rateMap.delete(key);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const { postId, event } = parsed.data;

    // Rate limit: 1 event per IP per article per minute
    const ip = getTrustedClientIpFromHeaders(request.headers) ?? 'unknown';
    const rateKey = `${ip}:${postId}:${event}`;
    const now = Date.now();

    cleanupRateMap();

    const lastTime = rateMap.get(rateKey);
    if (lastTime && now - lastTime < 60_000) {
      return NextResponse.json({ success: true, skipped: 'rate_limited' });
    }
    rateMap.set(rateKey, now);

    const supabase = createAdminClient();

    // Read current counts then increment
    const { data: post } = await supabase
      .from('editorial_posts')
      .select('view_count, click_count')
      .eq('id', postId)
      .maybeSingle();

    if (!post) {
      return NextResponse.json({ success: false, reason: 'not_found' }, { status: 404 });
    }

    if (event === 'view') {
      await supabase
        .from('editorial_posts')
        .update({
          view_count: ((post.view_count as number) ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq('id', postId);
    } else {
      await supabase
        .from('editorial_posts')
        .update({
          click_count: ((post.click_count as number) ?? 0) + 1,
        })
        .eq('id', postId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[editorial/track] Error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
