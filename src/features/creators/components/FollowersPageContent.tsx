'use client';

import Image from 'next/image';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Follower {
    id: string;
    follower_id: string;
    created_at: string;
    profiles: {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        slug: string | null;
    } | {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        slug: string | null;
    }[] | null;
}

interface FollowerStats {
    totalFollowers: number;
    newFollowersThisMonth: number;
}

interface FollowersPageContentProps {
    followers: Follower[] | null;
    stats: FollowerStats | null;
    error?: string | null;
    locale: string;
}

export function FollowersPageContent({ followers, stats, error }: FollowersPageContentProps) {
    const t = useTranslations('dashboard.followers');

    if (error) {
        return (
            <div className="p-12 text-center text-red-500 bg-red-50 rounded-3xl">
                {t('error_loading')}
            </div>
        );
    }

    return (
        <div className="max-w-[1440px] mx-auto w-full space-y-8">
            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-white rounded-[24px] p-6 border border-kode01-noir/5">
                        <p className="text-sm text-kode01-noir/60 mb-1">{t('total_followers')}</p>
                        <p className="text-3xl font-bold text-kode01-noir">{stats.totalFollowers}</p>
                    </div>
                    <div className="bg-white rounded-[24px] p-6 border border-kode01-noir/5">
                        <p className="text-sm text-kode01-noir/60 mb-1">{t('new_this_month')}</p>
                        <p className="text-3xl font-bold text-kode01-pink">{stats.newFollowersThisMonth}</p>
                    </div>
                </div>
            )}

            {/* Followers List */}
            {!followers || followers.length === 0 ? (
                <div className="py-24 bg-white/50 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <Users size={28} className="text-kode01-noir/20" />
                    </div>
                    <h3 className="text-xl font-bold text-kode01-noir mb-2">{t('empty_title')}</h3>
                    <p className="text-kode01-noir/60 max-w-sm">{t('empty_description')}</p>
                </div>
            ) : (
                <div className="bg-white rounded-[24px] border border-kode01-noir/5 divide-y divide-kode01-noir/5">
                    {followers.map((follower) => {
                        const profile = Array.isArray(follower.profiles)
                            ? (follower.profiles[0] ?? null)
                            : follower.profiles;
                        if (!profile) return null;
                        const displayName = profile.display_name || 'User';
                        const avatarUrl = profile.avatar_url || '/placeholder-avatar.png';

                        return (
                            <div key={follower.id} className="flex items-center gap-4 p-5">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-kode01-cream border-2 border-white shadow-sm shrink-0">
                                    <Image
                                        src={avatarUrl}
                                        alt={displayName}
                                        width={40}
                                        height={40}
                                        className="object-cover w-full h-full"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-kode01-noir truncate">{displayName}</h4>
                                    <p className="text-xs text-kode01-noir/40">
                                        {t('follower_since')} {new Date(follower.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
