import { normalizeEnvValue } from '@/lib/env/normalize';

const MISSING_SUPABASE_ENV_ERROR =
    'Missing NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

function getSupabasePublicApiKey(): string | undefined {
    return normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
        ?? normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function assertPublicSupabaseApiKey(apiKey: string): void {
    if (apiKey.startsWith('sb_secret_')) {
        throw new Error('Invalid Supabase public API key: secret keys must never be exposed to browser clients.');
    }
}

export function isSupabasePublicEnvConfigured(): boolean {
    return Boolean(
        normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
        && getSupabasePublicApiKey(),
    );
}

export function isSupabaseAdminEnvConfigured(): boolean {
    return Boolean(
        normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL)
        && (
            normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
            || normalizeEnvValue(process.env.SUPABASE_SECRET_KEY)
        ),
    );
}

export function isMissingSupabasePublicEnvError(error: unknown): boolean {
    return error instanceof Error && error.message === MISSING_SUPABASE_ENV_ERROR;
}

export function getSupabasePublicEnv() {
    const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = getSupabasePublicApiKey();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(MISSING_SUPABASE_ENV_ERROR);
    }

    assertPublicSupabaseApiKey(supabaseAnonKey);

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(supabaseUrl);
    } catch {
        throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL: Must be a valid HTTP or HTTPS URL.');
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL: Must be a valid HTTP or HTTPS URL.');
    }

    return {
        supabaseUrl: parsedUrl.toString().replace(/\/+$/, ''),
        supabaseAnonKey,
    };
}
