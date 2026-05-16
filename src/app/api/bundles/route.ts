import { NextResponse } from 'next/server';
import { listPublicBundles } from '@/features/bundles/server/public-bundles';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

export async function GET() {
  try {
    const items = await listPublicBundles();
    return NextResponse.json({ items }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Bundles GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}
