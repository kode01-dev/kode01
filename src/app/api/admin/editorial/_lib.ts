import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import {
  EDITORIAL_DETAIL_SELECT,
  EDITORIAL_DETAIL_SELECT_LEGACY,
} from '@/features/editorial/server/author-name-compat';

export const EDITORIAL_SELECT = EDITORIAL_DETAIL_SELECT;
export const EDITORIAL_SELECT_LEGACY = EDITORIAL_DETAIL_SELECT_LEGACY;

export async function getEditorialAdminSessionOrNull(request?: Request) {
  const session = await getAdminSessionOrNull(request, 'admin.editorial');
  if (!session) return null;
  return {
    userId: session.userId,
    admin: createAdminClient(),
  };
}
