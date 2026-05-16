import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/auth/roles';

export type AdminActorSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

export async function getAdminActorSessionOrNull(): Promise<AdminActorSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) return null;
  return { supabase, userId: user.id };
}

export function isUserCurrentlyBlocked(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const expiresAt = new Date(bannedUntil);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > Date.now();
}
