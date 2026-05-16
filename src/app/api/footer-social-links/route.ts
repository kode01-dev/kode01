import { NextResponse } from 'next/server';
import { getEnabledSocialLinks, updateSocialLinks } from '@/features/footer-social-links/api';
import { updateSocialLinksSchema } from '@/features/footer-social-links/types';
import { createClient } from '@/lib/supabase/server';
import { isMissingSupabasePublicEnvError } from '@/lib/supabase/env';
import { hasVerifiedMfaMethod, isAal2 } from '@/lib/auth/mfa';
import { isAdminRole } from '@/lib/auth/roles';

const PUBLIC_SOCIAL_LINKS_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800',
};
export const revalidate = 300;

export async function GET() {
  let links: Awaited<ReturnType<typeof getEnabledSocialLinks>> = [];
  try {
    links = await getEnabledSocialLinks();
  } catch (error) {
    if (!isMissingSupabasePublicEnvError(error) || process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
  return NextResponse.json({ links }, { headers: PUBLIC_SOCIAL_LINKS_CACHE_HEADERS });
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return NextResponse.json(
        {
          error: 'MFA_REQUIRED',
          message: 'Admin MFA verification is required for this endpoint.',
        },
        { status: 403 },
      );
    }

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);

    const mfaVerified =
      !assuranceError &&
      Boolean(assurance) &&
      (
        isAal2(assurance.currentLevel) ||
        hasVerifiedMfaMethod(assurance.currentAuthenticationMethods)
      );

    if (!mfaVerified) {
      return NextResponse.json(
        {
          error: 'MFA_REQUIRED',
          message: 'Admin MFA verification is required for this endpoint.',
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const parsed = updateSocialLinksSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }

    await updateSocialLinks(parsed.data.links);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API footer-social-links PATCH error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
