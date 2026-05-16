'use client';

import React, { useState, useEffect } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toggleFollowCreator, getFollowStatus } from '../actions/follow-actions';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface FollowCreatorButtonProps {
    creatorId: string;
    variant?: 'icon' | 'full';
}

export function FollowCreatorButton({ creatorId, variant = 'icon' }: FollowCreatorButtonProps) {
    const { user, loading: authLoading } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const t = useTranslations('follow');

    useEffect(() => {
        if (!user) {
            setIsFollowing(false);
            setIsCheckingStatus(false);
            return;
        }

        const checkStatus = async () => {
            setIsCheckingStatus(true);
            try {
                const statuses = await getFollowStatus([creatorId]);
                setIsFollowing(!!statuses[creatorId]);
            } catch (error) {
                console.error('Failed to get follow status', error);
            } finally {
                setIsCheckingStatus(false);
            }
        };
        checkStatus();
    }, [creatorId, user]);

    const handleToggleFollow = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (authLoading || isCheckingStatus) return;

        if (!user) {
            toast.error(t('login_required'));
            return;
        }

        // Optimistic UI
        setIsFollowing((prev) => !prev);

        try {
            const result = await toggleFollowCreator({ creatorId });
            if (result.error) {
                setIsFollowing((prev) => !prev);
                toast.error(t('toggle_error'));
            } else {
                setIsFollowing(!!result.following);
                toast.success(result.following ? t('followed') : t('unfollowed'));
            }
        } catch {
            setIsFollowing((prev) => !prev);
            toast.error(t('toggle_error'));
        }
    };

    // Don't show follow button for own profile
    if (user?.id === creatorId) return null;

    if (variant === 'full') {
        return (
            <button
                onClick={handleToggleFollow}
                aria-label={isFollowing ? t('unfollow') : t('follow')}
                aria-pressed={isFollowing}
                disabled={authLoading || isCheckingStatus}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all cursor-pointer disabled:cursor-default ${
                    isFollowing
                        ? 'bg-kode01-pink/10 text-kode01-pink hover:bg-kode01-pink/20'
                        : 'bg-kode01-pink text-kode01-noir hover:scale-105'
                }`}
            >
                {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                {isFollowing ? t('following') : t('follow')}
            </button>
        );
    }

    // Icon variant (for cards)
    return (
        <button
            onClick={handleToggleFollow}
            aria-label={isFollowing ? t('unfollow') : t('follow')}
            aria-pressed={isFollowing}
            disabled={authLoading || isCheckingStatus}
            className={`flex items-center justify-center w-7 h-7 rounded-full transition-all shrink-0 cursor-pointer disabled:cursor-default ${
                isFollowing
                    ? 'bg-kode01-pink/10 text-kode01-pink hover:bg-kode01-pink/20'
                    : 'bg-white border border-kode01-noir/10 text-kode01-noir/40 hover:text-kode01-noir hover:border-kode01-noir/20 hover:bg-kode01-noir/5'
            }`}
        >
            {isFollowing ? <UserCheck size={14} className="fill-current" /> : <UserPlus size={14} />}
        </button>
    );
}
