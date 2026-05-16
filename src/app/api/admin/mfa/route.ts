import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';

const mfaActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('enroll'),
    friendlyName: z.string().trim().min(1).max(128).optional(),
  }),
  z.object({
    action: z.literal('verify'),
    factorId: z.string().trim().min(1),
    code: z.string().trim().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal('challenge'),
    factorId: z.string().trim().min(1),
    code: z.string().trim().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal('unenroll'),
    factorId: z.string().trim().min(1),
  }),
]);

type SupabaseApiError = {
  message?: string;
  status?: number;
};

function toStatusCode(error: SupabaseApiError | null, fallback = 500): number {
  if (!error || typeof error.status !== 'number') return fallback;
  if (error.status < 400 || error.status > 599) return fallback;
  return error.status;
}

function mfaErrorResponse(
  error: SupabaseApiError | null,
  fallbackMessage: string,
  fallbackStatus = 500,
) {
  return NextResponse.json(
    { error: error?.message ?? fallbackMessage },
    { status: toStatusCode(error, fallbackStatus) },
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getAdminSessionOrNull(request, 'admin.mfa');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { supabase } = session;
  const [{ data: assuranceData, error: assuranceError }, { data: factorsData, error: factorsError }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (assuranceError) {
    return mfaErrorResponse(assuranceError, 'Failed to load MFA assurance level');
  }

  if (factorsError) {
    return mfaErrorResponse(factorsError, 'Failed to load MFA factors');
  }

  const factors = (factorsData?.all ?? []).map((factor) => ({
    id: factor.id,
    factor_type: factor.factor_type,
    status: factor.status,
    friendly_name: factor.friendly_name,
    created_at: factor.created_at,
  }));

  return NextResponse.json({
    currentLevel: assuranceData?.currentLevel ?? null,
    currentAuthenticationMethods: assuranceData?.currentAuthenticationMethods ?? [],
    factors,
  });
}

export async function POST(request: Request) {
  const session = await getAdminSessionOrNull(request, 'admin.mfa');
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = mfaActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid MFA request payload' }, { status: 400 });
  }

  const { supabase } = session;

  switch (parsed.data.action) {
    case 'enroll': {
      const friendlyName = parsed.data.friendlyName?.trim() || 'Admin authenticator';
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (error || !data?.totp?.qr_code) {
        return mfaErrorResponse(error, 'Failed to start MFA enrollment');
      }

      return NextResponse.json({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret ?? null,
      });
    }
    case 'verify':
    case 'challenge': {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: parsed.data.factorId,
        code: parsed.data.code,
      });

      if (error) {
        return mfaErrorResponse(error, 'Failed to verify MFA code');
      }

      return NextResponse.json({ success: true });
    }
    case 'unenroll': {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: parsed.data.factorId,
      });

      if (error) {
        return mfaErrorResponse(error, 'Failed to remove MFA factor');
      }

      return NextResponse.json({ success: true });
    }
  }
}
