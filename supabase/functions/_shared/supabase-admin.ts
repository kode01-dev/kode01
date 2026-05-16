import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { getEdgeEnv } from './env.ts';

const env = getEdgeEnv();

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

