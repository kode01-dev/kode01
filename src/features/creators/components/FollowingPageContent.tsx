'use client';

import Image from 'next/image';
import Link from 'next/link';
import { UserPlus, ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FollowCreatorButton } from './FollowCreatorButton';
import type { ActivityProduct, FollowedCreator } from '../types';

interface FollowingPageContentProps {
    creators: FollowedCreator[] | null;
    activity: ActivityProduct[] | null;
    creatorsError?: string | null;
    activityError?: string | null;
    locale: string;
}

export function FollowingPageContent({ creators, activity, creatorsError, activityError, locale }: FollowingPageContentProps) {
    const t = useTranslations('dashboard.following');

    if (creatorsError) {
        return (
            <div className="p-12 text-center text-red-500 bg-red-50 rounded-3xl">
                {t('error_loading')}
            </div>
        );
    }

    if (!creators || creators.length === 0) {
        return (
            <div className="py-24 bg-white/50 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <UserPlus size={28} className="text-kode01-noir/20" />
                </div>
                <h3 className="text-xl font-bold text-kode01-noir mb-2">{t('empty_title')}</h3>
                <p className="text-kode01-noir/60 mb-8 max-w-sm">{t('empty_description')}</p>
                <Link
                    href={`/${locale}/creators`}
                    className="bg-kode01-pink text-kode01-noir font-bold py-3 px-8 rounded-full hover:scale-105 transition-all"
                >
                    {t('discover_creators')}
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-[1440px] mx-auto w-full space-y-12">
            {/* Followed Creators */}
            <section>
                <h2 className="text-lg font-bold text-kode01-noir mb-6">{t('followed_creators_title')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {creators.map((follow) => {
                        const profile = follow.profiles;
                        if (!profile) return null;
                        const displayName = profile.shop_name || profile.display_name || 'Creator';
                        const avatarUrl = profile.avatar_url || '/placeholder-avatar.png';

                        return (
                            <div key={follow.id} className="relative bg-white rounded-[24px] p-6 border border-kode01-noir/5 hover:shadow-lg transition-all">
                                <div className="absolute top-4 right-4 z-10">
                                    <FollowCreatorButton creatorId={profile.id} variant="icon" />
                                </div>
                                <Link href={`/${locale}/creators/${profile.slug || profile.id}`} className="block">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="relative w-12 h-12 rounded-full overflow-hidden bg-kode01-cream border-2 border-white shadow-sm shrink-0">
                                            <Image
                                                src={avatarUrl}
                                                alt={displayName}
                                                width={48}
                                                height={48}
                                                className="object-cover w-full h-full"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-kode01-noir truncate">{displayName}</h3>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Activity Feed */}
            <section>
                <h2 className="text-lg font-bold text-kode01-noir mb-6">{t('activity_title')}</h2>
                {activityError || !activity || activity.length === 0 ? (
                    <div className="py-12 bg-white/50 rounded-[24px] border border-black/5 text-center">
                        <p className="text-kode01-noir/60">{t('activity_empty')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {activity.map((product) => {
                            const seller = product.profiles;
                            const sellerName = seller?.shop_name || seller?.display_name || 'Creator';

                            return (
                                <Link
                                    key={product.id}
                                    href={`/${locale}/product/${product.slug}`}
                                    className="flex items-center gap-4 bg-white rounded-[20px] p-4 border border-kode01-noir/5 hover:shadow-md transition-all group"
                                >
                                    {product.cover_image_url ? (
                                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-kode01-cream shrink-0">
                                            <Image
                                                src={product.cover_image_url}
                                                alt={product.title}
                                                width={64}
                                                height={64}
                                                className="object-cover w-full h-full"
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 rounded-xl bg-kode01-cream flex items-center justify-center shrink-0">
                                            <ShoppingBag className="w-6 h-6 text-kode01-noir/20" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-kode01-pink bg-kode01-pink/10 px-2 py-0.5 rounded-full">
                                                {t('new_product')}
                                            </span>
                                            <span className="text-xs text-kode01-noir/40">
                                                {new Date(product.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-kode01-noir truncate group-hover:text-kode01-pink transition-colors">
                                            {product.title}
                                        </h4>
                                        <p className="text-sm text-kode01-noir/60">{sellerName}</p>
                                    </div>
                                    <span className="text-sm font-bold text-kode01-noir shrink-0">
                                        {product.price > 0 ? `$${product.price}` : 'Free'}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
