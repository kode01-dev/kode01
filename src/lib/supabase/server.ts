import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { getSupabasePublicEnv } from './env'
import { getSupabaseSessionCookiePolicy } from './cookie-options'
import type { Database } from '@/types/database.types'

export async function createClient() {
    const cookieStore = await cookies()
    const headerStore = await headers()
    const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
    const sessionCookiePolicy = getSupabaseSessionCookiePolicy(
        headerStore.get('x-forwarded-host') ?? headerStore.get('host'),
    );

    return createServerClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
            cookieOptions: {
                ...sessionCookiePolicy,
            },
        }
    )
}
