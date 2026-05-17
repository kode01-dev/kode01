import 'server-only';
import Stripe from 'stripe';
import { getRequiredServerEnv } from '@/lib/env/server';
import { STRIPE_API_VERSION_CONFIG } from '@/lib/stripe/api-version';

const env = getRequiredServerEnv(['STRIPE_SECRET_KEY']);
const stripeSecretKey = env.STRIPE_SECRET_KEY || 'sk_test_build_time_placeholder';

export const stripe = new Stripe(stripeSecretKey, {
    // https://github.com/stripe/stripe-node#configuration
    apiVersion: STRIPE_API_VERSION_CONFIG,
    appInfo: {
        name: 'kode01 Marketplace',
        url: 'https://kode01.co',
    },
});
