// Re-export a singleton browser Supabase client for use in service modules
import { createClient } from './supabase/client';

export const supabase = createClient();
