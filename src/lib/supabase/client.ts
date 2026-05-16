import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublicEnv } from './env'
import { getSupabaseSessionCookiePolicy } from './cookie-options'
import type { Database } from '@/types/database.types'

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
    if (browserClient) {
        return browserClient;
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
    const runtimeHost = typeof window !== 'undefined' ? window.location.host : undefined;
    const sessionCookiePolicy = getSupabaseSessionCookiePolicy(runtimeHost);

    browserClient = createBrowserClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookieOptions: {
                ...sessionCookiePolicy,
                // Browsers cannot set HttpOnly via document.cookie.
                httpOnly: false,
            },
        },
    )

    return browserClient;
}
