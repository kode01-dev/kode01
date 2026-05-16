'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { FollowCreatorButton } from './FollowCreatorButton';

export interface Creator {
    id: string;
    display_name: string;
    shop_name?: string | null;
    avatar_url?: string | null;
    is_verified: boolean;
    slug?: string | null;
    productsCount: number;
}

interface CreatorCardProps {
    creator: Creator;
    locale: string;
}

export function CreatorCard({ creator, locale }: CreatorCardProps) {
    const avatarUrl = creator.avatar_url || '/placeholder-avatar.png';
    const displayName = creator.shop_name || creator.display_name || 'Anonymous Creator';

    return (
        <Link
            href={`/${locale}/creators/${creator.slug || creator.id}`}
            className="group block"
        >
            <div className="relative bg-white rounded-[32px] p-8 hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-kode01-noir/5">
                {/* Follow Button */}
                <div className="absolute top-4 right-4 z-10">
                    <FollowCreatorButton creatorId={creator.id} variant="icon" />
                </div>

                {/* Avatar */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="w-full h-full rounded-full overflow-hidden bg-kode01-cream border-4 border-white shadow-lg">
                        <Image
                            src={avatarUrl}
                            alt={displayName}
                            width={96}
                            height={96}
                            className="object-cover w-full h-full"
                        />
                    </div>
                </div>

                {/* Creator Info */}
                <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-kode01-noir mb-2 line-clamp-1">
                        {displayName}
                    </h3>
                    <div className="flex items-center justify-center gap-2 text-kode01-noir/60 text-sm font-medium">
                        <ShoppingBag className="w-4 h-4" />
                        <span>{creator.productsCount} {creator.productsCount === 1 ? 'product' : 'products'}</span>
                    </div>
                </div>

                {/* CTA Button */}
                <button className="w-full bg-kode01-pink text-kode01-noir font-bold py-3 px-6 rounded-full transition-all duration-200 group-hover:scale-105">
                    View Products
                </button>
            </div>
        </Link>
    );
}
