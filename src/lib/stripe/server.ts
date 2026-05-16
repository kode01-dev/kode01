import 'server-only';
import Stripe from 'stripe';
import { getRequiredServerEnv } from '@/lib/env/server';

const env = getRequiredServerEnv(['STRIPE_SECRET_KEY']);
const stripeSecretKey = env.STRIPE_SECRET_KEY || 'sk_test_build_time_placeholder';

export const stripe = new Stripe(stripeSecretKey, {
    // https://github.com/stripe/stripe-node#configuration
    apiVersion: '2026-02-25.clover',
    appInfo: {
        name: 'kode01 Marketplace',
        url: 'https://kode01.co',
    },
});
