import { getEdgeEnv } from '../_shared/env.ts';
import {
  badRequest,
  internalServerError,
  isInternalAuthorized,
  json,
  methodNotAllowed,
  unauthorized,
} from '../_shared/http.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';

const schema = z.object({
  userId: z.string().uuid(),
  locale: z.string().optional(),
  returnPath: z.string().optional(),
});

function normalizeLocale(input: string | undefined) {
  if (!input) return 'en';
  return input.toLowerCase() === 'fr' ? 'fr' : 'en';
}

function resolveReturnPath(raw: string | undefined, locale: string) {
  if (!raw) return `/${locale}/pricing`;
  if (!raw.startsWith('/')) return `/${locale}/pricing`;
  if (raw.startsWith('//')) return `/${locale}/pricing`;
  return raw;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { userId, locale, returnPath } = parsed.data;
  const stripe = getStripe();
  const env = getEdgeEnv();

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, display_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) return badRequest('Profile not found');

    let customerId = profile.stripe_customer_id;

    if (!customerId) {
      const { data: authUserResult, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authUserError) {
        console.error('stripe-customer-portal auth lookup error:', authUserError);
        return internalServerError();
      }

      const authUser = authUserResult?.user;
      const customer = await stripe.customers.create({
        email: authUser?.email ?? undefined,
        name: profile.display_name ?? undefined,
        metadata: {
          userId,
        },
      });

      customerId = customer.id;

      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);

      if (updateProfileError) {
        console.error('stripe-customer-portal profile update error:', updateProfileError);
        return internalServerError();
      }
    }

    const currentLocale = normalizeLocale(locale);
    const safePath = resolveReturnPath(returnPath, currentLocale);
    const returnUrl = `${env.appBaseUrl}${safePath}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return json({ url: portalSession.url });
  } catch (error) {
    console.error('stripe-customer-portal error:', error);
    return internalServerError();
  }
});
