import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

type PaymentMethodStatusPayload = {
  stripeCustomerLinked: boolean;
  hasPaymentMethod: boolean;
  paymentMethodsCount: number;
  cardBrand: string | null;
  cardLast4: string | null;
};

function buildEmptyStatus(stripeCustomerLinked: boolean): PaymentMethodStatusPayload {
  return {
    stripeCustomerLinked,
    hasPaymentMethod: false,
    paymentMethodsCount: 0,
    cardBrand: null,
    cardLast4: null,
  };
}

function getStripeErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    const isMissingProfile = profileError?.code === 'PGRST116';
    if (profileError && !isMissingProfile) {
      console.error('Failed to load billing profile:', profileError);
      return NextResponse.json({ error: 'Unable to load billing profile' }, { status: 500 });
    }

    if (!profile || isMissingProfile) {
      return NextResponse.json(buildEmptyStatus(false));
    }

    const stripeCustomerId = profile.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json(buildEmptyStatus(false));
    }

    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId, {
        expand: ['invoice_settings.default_payment_method'],
      });

      if (customer.deleted) {
        return NextResponse.json(buildEmptyStatus(false));
      }

      const defaultPaymentMethod = customer.invoice_settings.default_payment_method;
      const defaultPaymentMethodId =
        typeof defaultPaymentMethod === 'string'
          ? defaultPaymentMethod
          : defaultPaymentMethod?.id ?? null;

      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
        limit: 100,
      });

      const paymentMethodsCount = paymentMethods.data.length;
      const selectedMethod =
        paymentMethods.data.find((paymentMethod) => paymentMethod.id === defaultPaymentMethodId) ??
        paymentMethods.data[0] ??
        null;

      return NextResponse.json({
        stripeCustomerLinked: true,
        hasPaymentMethod: paymentMethodsCount > 0,
        paymentMethodsCount,
        cardBrand: selectedMethod?.card?.brand ?? null,
        cardLast4: selectedMethod?.card?.last4 ?? null,
      } satisfies PaymentMethodStatusPayload);
    } catch (error) {
      if (getStripeErrorCode(error) === 'resource_missing') {
        return NextResponse.json(buildEmptyStatus(false));
      }
      throw error;
    }
  } catch (error) {
    console.error('Payment method status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

