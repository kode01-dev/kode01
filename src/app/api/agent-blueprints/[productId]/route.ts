import { NextResponse } from 'next/server';
import { getBlueprintPublicMetadata } from '@/features/agent-blueprints/server/repository';

/**
 * GET /api/agent-blueprints/[productId]
 *
 * Returns public metadata for a blueprint (manifest, readme, license, vetted status).
 * NEVER returns prompt_content or tools_config.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await params;

    if (!productId) {
      return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
    }

    const metadata = await getBlueprintPublicMetadata(productId);

    if (!metadata) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Blueprint metadata API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
