import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';

const preferenceSchema = z.object({
  recommendationPersonalizationEnabled: z.boolean(),
});

export async function PATCH(req: Request) {
  const auditContext = getAuditContextFromRequest(req);

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = preferenceSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const enabled = parsed.data.recommendationPersonalizationEnabled;
    const { error } = await supabase
      .from('profiles')
      .update({ recommendation_personalization_enabled: enabled })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to update recommendation personalization preference:', error);
      return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'recommendation_personalization_preference_updated',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { enabled },
    });

    return NextResponse.json({ recommendationPersonalizationEnabled: enabled });
  } catch (error) {
    console.error('Recommendation preference route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
