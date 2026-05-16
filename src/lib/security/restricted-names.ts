import { createClient } from '@/lib/supabase/server';

export type RestrictedName = {
  id: string;
  keyword: string;
  is_regex: boolean;
  reason?: string | null;
}

/**
 * Validates a shop name against the database of restricted keywords.
 * Returns { isValid: true } if allowed, or { isValid: false, errorKey: 'shop_name_restricted' } if not.
 */
export async function validateShopName(name: string): Promise<{ isValid: boolean; errorKey?: string }> {
  if (!name || name.trim().length === 0) return { isValid: true };

  const supabase = await createClient();
  const normalizedName = name.trim().toLowerCase();

  // Fetch all restricted keywords
  const { data: restrictedList, error } = await supabase
    .from('restricted_shop_names')
    .select('keyword, is_regex');

  if (error || !restrictedList) {
    console.error('Error fetching restricted shop names:', error);
    // Fail safe: if DB is down, allow unless it's obviously bad (hardcoded fallback)
    const fallbackHardcoded = ['kode01', 'admin', 'support'];
    if (fallbackHardcoded.some(keyword => normalizedName.includes(keyword))) {
        return { isValid: false, errorKey: 'shop_name_restricted' };
    }
    return { isValid: true };
  }

  for (const entry of restrictedList) {
    const keyword = entry.keyword.toLowerCase();
    
    if (entry.is_regex) {
      try {
        const regex = new RegExp(keyword, 'i');
        if (regex.test(normalizedName)) {
          return { isValid: false, errorKey: 'shop_name_restricted' };
        }
      } catch (e) {
        console.error(`Invalid regex in DB: ${keyword}`, e);
      }
    } else {
      // Literal check: if the name CONTAINS the keyword
      if (normalizedName.includes(keyword)) {
        return { isValid: false, errorKey: 'shop_name_restricted' };
      }
    }
  }

  return { isValid: true };
}
