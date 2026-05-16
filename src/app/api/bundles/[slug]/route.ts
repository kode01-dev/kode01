import { NextResponse } from 'next/server';
import { getPublicBundleBySlug } from '@/features/bundles/server/public-bundles';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

type Params = { slug: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const resolved = await params;
    const bundle = await getPublicBundleBySlug(resolved.slug);

    if (!bundle) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404, headers: PUBLIC_CACHE_HEADERS });
    }

    return NextResponse.json({ item: bundle }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Bundle detail GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
