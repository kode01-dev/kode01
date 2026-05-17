import type Stripe from 'stripe';

export const STRIPE_API_VERSION = '2026-02-25.clover';

type StripeConfigApiVersion = NonNullable<ConstructorParameters<typeof Stripe>[1]>['apiVersion'];

export const STRIPE_API_VERSION_CONFIG = STRIPE_API_VERSION as StripeConfigApiVersion;
