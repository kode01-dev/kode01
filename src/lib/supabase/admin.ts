import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '@/lib/env/server';
import { normalizeSupabaseApiKey } from '@/lib/supabase/api-key';
import type { Database } from '@/types/database.types';

let _adminClient: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (_adminClient) return _adminClient;

  const env = getRequiredServerEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const serviceRoleKey = normalizeSupabaseApiKey(env.SUPABASE_SERVICE_ROLE_KEY);

  _adminClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}
