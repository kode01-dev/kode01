import 'server-only';

import { unstable_cache } from 'next/cache';

import { PUBLIC_CACHE_TAGS } from '@/lib/cache/tags';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import { isVendorBadgeType, type VendorBadgeType } from '../types';

interface VendorBadgeRow {
  badge_type: string;
  awarded_at: string;
}

async function getVendorBadgesUncached(vendorId: string): Promise<VendorBadgeType[]> {
  if (!vendorId) return [];

  const supabase = createPublicServerClient();
  // vendor_badges is a new table not yet present in the generated Database types,
  // so we bypass the typed query builder here.
  const { data, error } = await (
    supabase.from('vendor_badges' as never) as unknown as {
      select: (cols: string) => {
        eq: (col: string, value: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => Promise<{ data: VendorBadgeRow[] | null; error: unknown }>;
        };
      };
    }
  )
    .select('badge_type, awarded_at')
    .eq('vendor_id', vendorId)
    .order('awarded_at', { ascending: true });

  if (error || !data) return [];

  return data
    .map((row) => row.badge_type)
    .filter(isVendorBadgeType);
}

export const getVendorBadges = (vendorId: string): Promise<VendorBadgeType[]> => {
  const cached = unstable_cache(
    async (id: string) => getVendorBadgesUncached(id),
    ['vendor-badges:v1'],
    { tags: [PUBLIC_CACHE_TAGS.creators], revalidate: 300 },
  );
  return cached(vendorId);
};
