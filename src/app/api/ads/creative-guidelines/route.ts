import { NextResponse } from 'next/server';
import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';

export async function GET() {
  return NextResponse.json({ data: adCreativeGuidelines });
}
