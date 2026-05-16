import { supabaseAdmin } from './supabase-admin.ts';

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export async function checkRateLimit({ key, limit, windowSeconds }: RateLimitOptions) {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

