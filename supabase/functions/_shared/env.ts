export type EdgeEnv = {
  appBaseUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripeBasicPriceId?: string;
  stripeProPriceId?: string;
  stripeSubscriptionPlanPriceIds?: string;
  stripeSubscriptionFeatureKey?: string;
  stripeSubscriptionFeatureKeyByPlan?: string;
  stripeSubscriptionProPlanKeys?: string;
  stripeSubscriptionSuccessPath?: string;
  stripeSubscriptionCancelPath?: string;
  stripeConnectedAccountCountry?: string;
  resendApiKey?: string;
  cronSecret?: string;
  cronSecretNext?: string;
  edgeInternalAuthToken?: string;
  edgeInternalAuthTokenNext?: string;
  firecrawlApiKey?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  anthropicModelPrimary?: string;
  anthropicModelFallback?: string;
  recapSummaryModel?: string;
  recapArticleModel?: string;
  recapArticleHour?: string;
  recapNewsletterHour?: string;
  sendfoxApiToken?: string;
  sendfoxListId?: string;
  recapMaxSources?: string;
  recapTimezone?: string;
  recapRetryCutoffHour?: string;
};

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function optionalEnv(name: string) {
  const value = Deno.env.get(name);
  return value ? value.trim() : undefined;
}

export function getEdgeEnv(): EdgeEnv {
  return {
    appBaseUrl: (optionalEnv('APP_BASE_URL') ?? requireEnv('NEXT_PUBLIC_APP_URL')).replace(/\/+$/, ''),
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    stripeSecretKey: optionalEnv('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: optionalEnv('STRIPE_WEBHOOK_SECRET'),
    stripeBasicPriceId: optionalEnv('STRIPE_BASIC_PRICE_ID') ?? optionalEnv('BASIC_PRICE_ID'),
    stripeProPriceId: optionalEnv('STRIPE_PRO_PRICE_ID') ?? optionalEnv('PRO_PRICE_ID'),
    stripeSubscriptionPlanPriceIds: optionalEnv('STRIPE_SUBSCRIPTION_PLAN_PRICE_IDS'),
    stripeSubscriptionFeatureKey: optionalEnv('STRIPE_SUBSCRIPTION_FEATURE_KEY'),
    stripeSubscriptionFeatureKeyByPlan: optionalEnv('STRIPE_SUBSCRIPTION_FEATURE_KEY_BY_PLAN'),
    stripeSubscriptionProPlanKeys: optionalEnv('STRIPE_SUBSCRIPTION_PRO_PLAN_KEYS'),
    stripeSubscriptionSuccessPath: optionalEnv('STRIPE_SUBSCRIPTION_SUCCESS_PATH'),
    stripeSubscriptionCancelPath: optionalEnv('STRIPE_SUBSCRIPTION_CANCEL_PATH'),
    stripeConnectedAccountCountry: optionalEnv('STRIPE_CONNECTED_ACCOUNT_COUNTRY'),
    resendApiKey: optionalEnv('RESEND_API_KEY'),
    cronSecret: optionalEnv('CRON_SECRET'),
    cronSecretNext: optionalEnv('CRON_SECRET_NEXT'),
    edgeInternalAuthToken: optionalEnv('EDGE_INTERNAL_AUTH_TOKEN'),
    edgeInternalAuthTokenNext: optionalEnv('EDGE_INTERNAL_AUTH_TOKEN_NEXT'),
    firecrawlApiKey: optionalEnv('FIRECRAWL_API_KEY'),
    googleApiKey: optionalEnv('GOOGLE_API_KEY') ?? optionalEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
    anthropicApiKey: optionalEnv('ANTHROPIC_API_KEY'),
    anthropicModelPrimary: optionalEnv('ANTHROPIC_MODEL_PRIMARY'),
    anthropicModelFallback: optionalEnv('ANTHROPIC_MODEL_FALLBACK'),
    recapSummaryModel: optionalEnv('RECAP_SUMMARY_MODEL'),
    recapArticleModel: optionalEnv('RECAP_ARTICLE_MODEL'),
    recapArticleHour: optionalEnv('RECAP_ARTICLE_HOUR'),
    recapNewsletterHour: optionalEnv('RECAP_NEWSLETTER_HOUR'),
    sendfoxApiToken: optionalEnv('SENDFOX_API_TOKEN'),
    sendfoxListId: optionalEnv('SENDFOX_LIST_ID'),
    recapMaxSources: optionalEnv('RECAP_MAX_SOURCES'),
    recapTimezone: optionalEnv('RECAP_TIMEZONE'),
    recapRetryCutoffHour: optionalEnv('RECAP_RETRY_CUTOFF_HOUR'),
  };
}
