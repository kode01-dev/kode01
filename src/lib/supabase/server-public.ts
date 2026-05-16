import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from './env';
import type { Database } from '@/types/database.types';

export function createPublicServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

