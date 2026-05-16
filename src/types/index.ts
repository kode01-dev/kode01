// Core application types shared across services, components, and pages

export interface Profile {
    id: string;
    name: string;
    email?: string;
    avatar_url?: string | null;
    title?: string | null;
    bio?: string | null;
    subscription_tier?: string | null;
    role?: string;
    created_at: string;
    updated_at: string;
}
