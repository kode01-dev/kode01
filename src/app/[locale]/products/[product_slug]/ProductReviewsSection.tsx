'use client';

import { useLocale, useTranslations } from 'next-intl';

const STAR = '\u2605';

export interface ProductReview {
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    authorName: string;
}

interface ProductReviewsSectionProps {
    reviews: ProductReview[];
}

function formatReviewDate(value: string, locale: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function ProductReviewsSection({
    reviews,
}: ProductReviewsSectionProps) {
    const t = useTranslations('product');
    const locale = useLocale();

    return (
        <section id="reviews" className="space-y-8">
            <div className="space-y-4">
                {reviews.length === 0 && (
                    <div className="rounded-[28px] border border-black/10 bg-white p-6">
                        <p className="text-sm font-medium text-kode01-noir/60">{t('reviews.empty')}</p>
                    </div>
                )}

                {reviews.map((review) => (
                    <article key={review.id} className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-sm font-black text-kode01-noir">{review.authorName}</p>
                                <p className="text-xs uppercase tracking-widest text-kode01-noir/40">
                                    {formatReviewDate(review.createdAt, locale)}
                                </p>
                            </div>
                            <div className="text-yellow-500 font-bold text-sm">
                                {STAR.repeat(review.rating)}
                                <span className="text-kode01-noir/20">{STAR.repeat(5 - review.rating)}</span>
                            </div>
                        </div>
                        <p className="text-kode01-noir/70 leading-relaxed whitespace-pre-wrap">{review.comment}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}
