import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveActiveCreativeForPlacement } from '@/features/ads/server/repository';

const schema = z.object({
  placement: z.enum(['free', 'news', 'newsletter_footer']),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = schema.safeParse({
      placement: url.searchParams.get('placement'),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
    }

    const creative = await resolveActiveCreativeForPlacement(parsed.data.placement);
    return NextResponse.json({ data: creative });
  } catch (error) {
    console.error('Serve ad error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
