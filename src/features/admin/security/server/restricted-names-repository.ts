import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RestrictedName {
  id: string;
  keyword: string;
  is_regex: boolean;
  reason: string | null;
  created_at: string;
}

export async function getRestrictedNames() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('restricted_shop_names')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch restricted names:', error);
    return [];
  }

  return data as RestrictedName[];
}

export async function addRestrictedName(payload: { keyword: string; is_regex: boolean; reason?: string }) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('restricted_shop_names')
    .insert([{
      keyword: payload.keyword.toLowerCase().trim(),
      is_regex: payload.is_regex,
      reason: payload.reason?.trim() || null
    }])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as RestrictedName;
}

export async function deleteRestrictedName(id: string) {
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from('restricted_shop_names')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
