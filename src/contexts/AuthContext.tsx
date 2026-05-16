'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isMissingSupabasePublicEnvError, isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import type { User } from '@supabase/supabase-js';

interface Profile {
    id: string;
    role: 'buyer' | 'seller' | 'admin';
    slug: string | null;
    display_name: string | null;
    shop_name: string | null;
    avatar_url: string | null;
    stripe_customer_id?: string | null;
    onboarding_completed: boolean;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    isAuthenticated: boolean;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    isAuthenticated: false,
    refreshAuth: async () => { },
});

type AuthSessionResponse = {
    user: User | null;
    profile: Profile | null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshAuth = useCallback(async () => {
        setLoading(true);

        try {
            const response = await fetch('/api/auth/session', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(`Auth session request failed with ${response.status}`);
            }

            const data = (await response.json()) as AuthSessionResponse;
            setUser(data.user ?? null);
            setProfile(data.profile ?? null);
        } catch (error) {
            console.error('Error reading auth session:', error);
            setUser(null);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cleanup = () => { };
        let supabase;

        if (!isSupabasePublicEnvConfigured()) {
            setLoading(false);
            return cleanup;
        }

        try {
            supabase = createClient();
        } catch (error) {
            if (!isMissingSupabasePublicEnvError(error)) {
                console.error('Error creating Supabase auth client:', error);
            }
            setLoading(false);
            return cleanup;
        }

        // Get initial session
        void refreshAuth();

        // Keep client state aligned with server-managed HttpOnly auth cookies.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            () => {
                void refreshAuth();
            }
        );

        cleanup = () => subscription.unsubscribe();
        return cleanup;
    }, [refreshAuth]);

    return (
        <AuthContext.Provider value={{ user, profile, loading, isAuthenticated: !!user, refreshAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
