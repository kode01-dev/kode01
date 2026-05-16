import { NextResponse } from 'next/server';
import { getPushPublicConfig } from '@/features/notifications/server/push';

export async function GET() {
  try {
    return NextResponse.json(getPushPublicConfig());
  } catch (error) {
    console.error('Notifications push-config GET error:', error);
    return NextResponse.json({ enabled: false, publicKey: null }, { status: 200 });
  }
}
