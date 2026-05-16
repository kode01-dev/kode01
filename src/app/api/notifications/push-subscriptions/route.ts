import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  deactivatePushSubscription,
  pushSubscriptionSchema,
  upsertPushSubscription,
} from '@/features/notifications/server/push';

const deleteSchema = z.object({
  endpoint: z.string().trim().url(),
});

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = pushSubscriptionSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await upsertPushSubscription({
      userId: user.id,
      subscription: parsed.data,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Notifications push-subscriptions POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = deleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await deactivatePushSubscription({
      userId: user.id,
      endpoint: parsed.data.endpoint,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Notifications push-subscriptions DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
