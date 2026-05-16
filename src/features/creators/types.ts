export interface CreatorProfile {
    id: string;
    display_name: string;
    shop_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    slug: string | null;
}

export interface FollowedCreator {
    id: string;
    creator_id: string;
    created_at: string;
    profiles: CreatorProfile | null;
}

export interface ActivityProfile {
    display_name: string;
    shop_name: string | null;
    avatar_url: string | null;
    slug: string | null;
}

export interface ActivityProduct {
    id: string;
    title: string;
    slug: string;
    cover_image_url: string | null;
    price: number;
    created_at: string;
    seller_id: string;
    profiles: ActivityProfile | null;
}
