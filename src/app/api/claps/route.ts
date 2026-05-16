import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';
import type { ClapResponse } from '@/features/claps/types';

const CLAP_ANON_COOKIE = 'clap_anon_id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clapSchema = z.object({
  content_type: z.enum(['editorial_post', 'recap_post']),
  content_id: z.string().uuid(),
  count: z.literal(1).default(1),
});

export async function POST(req: Request) {
  try {
    // Rate limit by IP
    const rateLimitResponse = await enforceRouteRateLimit({
      request: req,
      action: 'ARTICLE_CLAP',
    });
    if (rateLimitResponse) return rateLimitResponse;

    // Parse + validate body
    const payload = await req.json().catch(() => null);
    const parsed = clapSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { content_type, content_id, count } = parsed.data;

    // Resolve clapper_id server-side only (never from client input)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let clapperId: string;
    const cookieStore = await cookies();

    if (user) {
      // Authenticated: use verified user ID
      clapperId = user.id;
    } else {
      // Anonymous: use or generate HttpOnly cookie UUID
      const existingId = cookieStore.get(CLAP_ANON_COOKIE)?.value;
      if (existingId && UUID_RE.test(existingId)) {
        clapperId = existingId;
      } else {
        clapperId = crypto.randomUUID();
      }
    }

    // Use admin client for the RPC call (SECURITY DEFINER needs service role
    // to bypass the read-only RLS on the table)
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('upsert_article_clap', {
      p_clapper_id: clapperId,
      p_content_type: content_type,
      p_content_id: content_id,
      p_add_count: count,
    });

    if (error) {
      // Surface "article not found" as 404, not 500
      if (error.message?.includes('not found') || error.message?.includes('not published')) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }
      console.error('Clap upsert error:', error);
      return NextResponse.json({ error: 'Failed to save clap' }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const result: ClapResponse = {
      userClaps: row?.user_claps ?? count,
      totalClaps: row?.total_claps ?? count,
    };

    // Set anonymous cookie if not logged in (HttpOnly, secure, server-controlled)
    const response = NextResponse.json(result);
    if (!user) {
      response.cookies.set(CLAP_ANON_COOKIE, clapperId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 365 * 24 * 60 * 60, // 1 year
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Clap route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
