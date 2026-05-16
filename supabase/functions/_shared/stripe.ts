import Stripe from 'https://esm.sh/stripe@20.4.0?target=deno';
import { getEdgeEnv } from './env.ts';

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const env = getEdgeEnv();
  if (!env.stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY for edge function.');
  }

  stripeClient = new Stripe(env.stripeSecretKey, {
    apiVersion: '2026-02-25.clover',
  });

  return stripeClient;
}

