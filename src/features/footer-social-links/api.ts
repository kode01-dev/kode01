import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SocialLink, SocialLinkInput } from './types';
import { revalidateTag } from 'next/cache';

export const SOCIAL_LINKS_TAG = 'footer-social-links';

export async function getSocialLinks(): Promise<SocialLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('footer_social_links')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error fetching social links:', error);
    return [];
  }

  return data as SocialLink[];
}

export async function getEnabledSocialLinks(): Promise<SocialLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('footer_social_links')
    .select('*')
    .eq('is_enabled', true)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error fetching enabled social links:', error);
    return [];
  }

  return data as SocialLink[];
}

export async function updateSocialLinks(links: SocialLinkInput[]) {
  const admin = createAdminClient();
  
  // To synchronize correctly:
  // 1. Get all new IDs
  // 2. Delete links that are NOT in the new list
  // 3. Upsert the new/updated ones
  
  const newIds = links.map(l => l.id).filter(Boolean);
  
  if (newIds.length > 0) {
    // Delete links that are NOT in the new list
    await admin
      .from('footer_social_links')
      .delete()
      .not('id', 'in', `(${newIds.join(',')})`);
  } else {
    // If list is empty, delete everything
    await admin
      .from('footer_social_links')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
  }
  
  const { error } = await admin
    .from('footer_social_links')
    .upsert(links, { onConflict: 'id' });

  if (error) {
    throw new Error(`Failed to update social links: ${error.message}`);
  }

  // Purge the cache for footer social links
  // In this version of Next.js, revalidateTag requires a profile.
  // We use 'default' as the profile.
  revalidateTag(SOCIAL_LINKS_TAG, 'default');
}
