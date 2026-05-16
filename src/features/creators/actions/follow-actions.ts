'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { ActivityProduct, ActivityProfile, FollowedCreator, CreatorProfile } from '../types';

const toggleFollowSchema = z.object({
    creatorId: z.string().uuid(),
});

function toSingleRelation<T>(relation: T | T[] | null | undefined): T | null {
    if (!relation) {
        return null;
    }

    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function toggleFollowCreator(payload: { creatorId: string }) {
    try {
        const parsed = toggleFollowSchema.safeParse(payload);
        if (!parsed.success) {
            return { error: 'Invalid payload' };
        }

        const { creatorId } = parsed.data;
        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return { error: 'Unauthorized' };
        }

        if (user.id === creatorId) {
            return { error: 'Cannot follow yourself' };
        }

        // Check if already following
        const { data: existing, error: checkError } = await supabase
            .from('creator_follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('creator_id', creatorId)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking follow status:', checkError);
            return { error: 'Failed to toggle follow status' };
        }

        if (existing) {
            // Unfollow
            const { error: deleteError } = await supabase
                .from('creator_follows')
                .delete()
                .eq('id', existing.id);

            if (deleteError) {
                console.error('Error unfollowing creator:', deleteError);
                return { error: 'Failed to unfollow creator' };
            }
            return { following: false };
        } else {
            // Follow
            const { error: insertError } = await supabase
                .from('creator_follows')
                .insert({
                    follower_id: user.id,
                    creator_id: creatorId,
                });

            if (insertError) {
                console.error('Error following creator:', insertError);
                return { error: 'Failed to follow creator' };
            }
            return { following: true };
        }
    } catch (error) {
        console.error('Unexpected error toggling follow status:', error);
        return { error: 'An unexpected error occurred' };
    }
}

export async function getFollowStatus(creatorIds: string[]) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user || creatorIds.length === 0) {
            return {};
        }

        const { data, error } = await supabase
            .from('creator_follows')
            .select('creator_id')
            .eq('follower_id', user.id)
            .in('creator_id', creatorIds);

        if (error) {
            console.error('Error fetching follow statuses:', error);
            return {};
        }

        const followMap: Record<string, boolean> = {};
        for (const row of data || []) {
            followMap[row.creator_id] = true;
        }
        return followMap;
    } catch (error) {
        console.error('Unexpected error fetching follow status:', error);
        return {};
    }
}

export async function getFollowedCreators(): Promise<{ creators: FollowedCreator[] | null; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { creators: null, error: 'Unauthorized' };
        }

        const { data, error } = await supabase
            .from('creator_follows')
            .select(`
                id,
                creator_id,
                created_at,
                profiles (
                    id,
                    display_name,
                    shop_name,
                    avatar_url,
                    is_verified,
                    slug
                )
            `)
            .eq('follower_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching followed creators:', error);
            return { creators: null, error: 'Failed to fetch followed creators' };
        }

        type FollowedCreatorRow = Omit<FollowedCreator, 'profiles'> & {
            profiles: CreatorProfile | CreatorProfile[] | null;
        };

        const creators: FollowedCreator[] = ((data ?? []) as FollowedCreatorRow[]).map((row) => ({
            ...row,
            profiles: toSingleRelation(row.profiles),
        }));

        return { creators };
    } catch (error) {
        console.error('Unexpected error fetching followed creators:', error);
        return { creators: null, error: 'An unexpected error occurred' };
    }
}

export async function getCreatorFollowers() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { followers: null, stats: null, error: 'Unauthorized' };
        }

        const { data: followers, error } = await supabase
            .from('creator_follows')
            .select(`
                id,
                follower_id,
                created_at,
                profiles (
                    id,
                    display_name,
                    avatar_url,
                    slug
                )
            `)
            .eq('creator_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching followers:', error);
            return { followers: null, stats: null, error: 'Failed to fetch followers' };
        }

        const totalFollowers = followers?.length ?? 0;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const newFollowersThisMonth = (followers ?? []).filter(
            (f) => new Date(f.created_at) >= thirtyDaysAgo
        ).length;

        return {
            followers: followers || [],
            stats: { totalFollowers, newFollowersThisMonth },
        };
    } catch (error) {
        console.error('Unexpected error fetching followers:', error);
        return { followers: null, stats: null, error: 'An unexpected error occurred' };
    }
}

export async function getFollowedCreatorsActivity(): Promise<{ activity: ActivityProduct[] | null; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { activity: null, error: 'Unauthorized' };
        }

        const { data: follows, error: followsError } = await supabase
            .from('creator_follows')
            .select('creator_id')
            .eq('follower_id', user.id);

        if (followsError) {
            console.error('Error fetching follows for activity:', followsError);
            return { activity: null, error: 'Failed to fetch activity' };
        }

        const creatorIds = (follows || []).map((f) => f.creator_id);

        if (creatorIds.length === 0) {
            return { activity: [] };
        }

        const { data: products, error: productsError } = await supabase
            .from('products')
            .select(`
                id,
                title,
                slug,
                cover_image_url,
                price,
                created_at,
                seller_id,
                profiles (
                    display_name,
                    shop_name,
                    avatar_url,
                    slug
                )
            `)
            .in('seller_id', creatorIds)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(20);

        if (productsError) {
            console.error('Error fetching activity products:', productsError);
            return { activity: null, error: 'Failed to fetch activity' };
        }

        type ActivityProductRow = Omit<ActivityProduct, 'profiles'> & {
            profiles: ActivityProfile | ActivityProfile[] | null;
        };

        const activity: ActivityProduct[] = ((products ?? []) as ActivityProductRow[]).map((product) => ({
            ...product,
            profiles: toSingleRelation(product.profiles),
        }));

        return { activity };
    } catch (error) {
        console.error('Unexpected error fetching activity:', error);
        return { activity: null, error: 'An unexpected error occurred' };
    }
}
