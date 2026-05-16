'use client';

import { Bookmark, Package } from 'lucide-react';
import Image from 'next/image';
import { ServiceImageFallback } from '@/components/services/ServiceImageFallback';
import { ApiContentStatusBadge } from '@/components/i18n/ApiContentStatusBadge';
import { inferStatusFromContentMetadata } from '@/lib/i18n/api-content-status';

export interface BundleProduct {
    id: string;
    title: string;
    slug: string;
    price: number;
    cover_image_url?: string | null;
    content_locales?: Array<'fr' | 'en'> | null;
    content_source_locale?: 'fr' | 'en' | null;
    seller?: {
        name?: string;
        avatar_url?: string | null;
    };
}

interface BundleCardProps {
    bundle: BundleProduct;
    locale: string;
    onClick?: () => void;
    onSave?: (e: React.MouseEvent) => void;
    isSaved?: boolean;
}

export function BundleCard({ bundle, locale, onClick, onSave, isSaved }: BundleCardProps) {
    const translationStatus = inferStatusFromContentMetadata(
        locale,
        bundle.content_locales,
        bundle.content_source_locale,
    );

    return (
        <article
            onClick={onClick}
            className="group bg-white rounded-[24px] p-6 transition-all duration-300 flex flex-col h-full cursor-pointer hover:-translate-y-2 hover:shadow-xl border border-black/5"
        >
            <button
                onClick={(e): void => {
                    e.stopPropagation();
                    onSave?.(e);
                }}
                className={`absolute top-8 right-8 z-10 p-2.5 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 ${isSaved
                    ? 'bg-kode01-pink text-kode01-noir'
                    : 'bg-white/80 backdrop-blur-md text-kode01-noir hover:bg-kode01-pink'
                    }`}
            >
                <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
            </button>

            <div className="relative overflow-hidden h-[220px] rounded-[16px] mb-5 bg-kode01-cream flex items-center justify-center">
                {bundle.cover_image_url ? (
                    <Image
                        src={bundle.cover_image_url}
                        alt={bundle.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                ) : (
                    <ServiceImageFallback title={bundle.title} seed={bundle.id} />
                )}
                {/* Bundle Badge */}
                <div className="absolute bottom-4 left-4 bg-kode01-noir/80 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <Package size={12} />
                    Pack
                </div>
            </div>

            <div className="flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-3 gap-2">
                    <h3 className="text-lg font-bold text-kode01-noir leading-tight font-sans line-clamp-2">
                        {bundle.title}
                    </h3>
                    <div className="bg-kode01-noir text-white px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap">
                        ${bundle.price}
                    </div>
                </div>
                <ApiContentStatusBadge
                    status={translationStatus}
                    locale={locale}
                    className="mb-3"
                />

                {bundle.seller && (
                    <div className="flex items-center gap-2 mt-auto pt-4 border-t border-black/5">
                        <div className="w-6 h-6 rounded-full relative overflow-hidden flex-shrink-0 bg-kode01-cream">
                            {bundle.seller.avatar_url ? (
                                <Image
                                    src={bundle.seller.avatar_url}
                                    alt={bundle.seller.name || 'Seller'}
                                    fill
                                    sizes="24px"
                                    className="object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-200 text-[10px] font-bold">
                                    {bundle.seller.name?.[0] || 'S'}
                                </div>
                            )}
                        </div>
                        <span className="text-xs font-medium text-kode01-noir/60 font-sans">
                            by {bundle.seller.name}
                        </span>
                    </div>
                )}
            </div>
        </article>
    );
}
