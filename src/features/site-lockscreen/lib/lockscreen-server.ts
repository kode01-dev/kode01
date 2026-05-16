import { createClient } from '@/lib/supabase/server';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import { isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { unstable_cache } from 'next/cache';
import { isAdminRole } from '@/lib/auth/roles';
import type { LockscreenConfig } from '../types';
import { normalizeLockscreenConfig } from './lockscreen-config';

export const PRELAUNCH_AUTH_COOKIE_NAME = 'prelaunch_auth_unlocked';
export const PRELAUNCH_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const LOCKSCREEN_CONFIG_PUBLIC_COLUMNS =
  'is_enabled, auth_gate_enabled, title_en, title_fr, message_en, message_fr, newsletter_enabled, newsletter_title_en, newsletter_title_fr, newsletter_cta_en, newsletter_cta_fr';
const LOCKSCREEN_CONFIG_PUBLIC_COLUMNS_LEGACY =
  'is_enabled, title_en, title_fr, message_en, message_fr, newsletter_enabled, newsletter_title_en, newsletter_title_fr, newsletter_cta_en, newsletter_cta_fr';
const LOCKSCREEN_CONFIG_CACHE_TAG = 'lockscreen-config';
const LOCKSCREEN_CONFIG_REVALIDATE_SECONDS = 60;

/**
 * Fetch the public lockscreen configuration (without password hash)
 * Returns null if no configuration exists
 */
async function getLockscreenConfigUncached(): Promise<LockscreenConfig | null> {
  try {
    if (!isSupabasePublicEnvConfigured() && process.env.NODE_ENV !== 'production') {
      return null;
    }

    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from('site_lockscreen_config')
      .select(LOCKSCREEN_CONFIG_PUBLIC_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      if (!data) return null;
      return normalizeLockscreenConfig(data);
    }

    const missingAuthGateColumn =
      typeof error.message === 'string' && error.message.includes('auth_gate_enabled');

    if (!missingAuthGateColumn) {
      console.error('Error fetching lockscreen config:', error);
      return null;
    }

    // Backward-compatible fallback while the DB migration is rolling out.
    const { data: legacyData, error: legacyError } = await supabase
      .from('site_lockscreen_config')
      .select(LOCKSCREEN_CONFIG_PUBLIC_COLUMNS_LEGACY)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacyError) {
      console.error('Error fetching legacy lockscreen config:', legacyError);
      return null;
    }

    if (!legacyData) return null;

    return normalizeLockscreenConfig({
      ...legacyData,
      auth_gate_enabled: false,
    });
  } catch (error) {
    console.error('Unexpected error fetching lockscreen config:', error);
    return null;
  }
}

const getLockscreenConfigCached = unstable_cache(
  async (): Promise<LockscreenConfig | null> => getLockscreenConfigUncached(),
  [LOCKSCREEN_CONFIG_CACHE_TAG],
  {
    revalidate: LOCKSCREEN_CONFIG_REVALIDATE_SECONDS,
    tags: [LOCKSCREEN_CONFIG_CACHE_TAG],
  },
);

export async function getLockscreenConfig(): Promise<LockscreenConfig | null> {
  return getLockscreenConfigCached();
}

/**
 * Check if the lockscreen is currently enabled
 * Returns false by default if config doesn't exist or on error
 */
export async function isLockscreenEnabled(): Promise<boolean> {
  const config = await getLockscreenConfig();
  return config?.is_enabled ?? false;
}

/**
 * Check if auth/login access is gated by prelaunch password
 * Returns false by default if config doesn't exist or on error
 */
export async function isAuthGateEnabled(): Promise<boolean> {
  const config = await getLockscreenConfig();
  return config?.auth_gate_enabled ?? false;
}

async function isConnectedAdminUser(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    return isAdminRole(profile?.role);
  } catch (error) {
    console.error('Error checking prelaunch admin bypass:', error);
    return false;
  }
}

export async function getPrelaunchAuthAccessState(): Promise<{
  enabled: boolean;
  locked: boolean;
  unlocked: boolean;
}> {
  try {
    const enabled = await isAuthGateEnabled();
    if (!enabled) {
      return {
        enabled: false,
        locked: false,
        unlocked: true,
      };
    }

    const cookieStore = await cookies();
    const unlockedByCookie = cookieStore.get(PRELAUNCH_AUTH_COOKIE_NAME)?.value === 'true';
    if (unlockedByCookie) {
      return {
        enabled: true,
        locked: false,
        unlocked: true,
      };
    }

    const unlockedByAdminSession = await isConnectedAdminUser();

    return {
      enabled: true,
      locked: !unlockedByAdminSession,
      unlocked: unlockedByAdminSession,
    };
  } catch (error) {
    console.error('Error checking prelaunch auth access state:', error);
    // Fail open to avoid blocking valid users because of transient runtime issues.
    return {
      enabled: false,
      locked: false,
      unlocked: true,
    };
  }
}

/**
 * Verify a password against the stored hash
 * Returns false if password is incorrect or on error
 */
export async function verifyLockscreenPassword(password: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('site_lockscreen_config')
      .select('password_hash')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.password_hash) {
      console.error('Error fetching password hash:', error);
      return false;
    }

    // Compare provided password with stored hash
    return await bcrypt.compare(password, data.password_hash);
  } catch (error) {
    console.error('Error verifying lockscreen password:', error);
    return false;
  }
}

/**
 * Hash a password using bcrypt (12 rounds)
 * Used when setting/updating the lockscreen password
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}
