'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReviewHubEntry, ReviewHubReview } from '../types';

const STAR = '\u2605';

type ReviewsHubPanelProps = {
  entries: ReviewHubEntry[];
  initialProductSlug: string | null;
};

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusLabelKey(status: ReviewHubEntry['purchaseStatus']) {
  return status === 'refunded' ? 'status_refunded' : 'status_completed';
}

export function ReviewsHubPanel({ entries, initialProductSlug }: ReviewsHubPanelProps) {
  const tHub = useTranslations('dashboard.reviews');
  const tProduct = useTranslations('product');
  const locale = useLocale();
  const router = useRouter();

  const initialProductId = useMemo(() => {
    if (entries.length === 0) return null;
    if (!initialProductSlug) return entries[0].productId;
    const deepLinked = entries.find((entry) => entry.productSlug === initialProductSlug);
    return deepLinked?.productId ?? entries[0].productId;
  }, [entries, initialProductSlug]);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId);
  const [reviewsByProduct, setReviewsByProduct] = useState<Record<string, ReviewHubReview | null>>(
    () => Object.fromEntries(entries.map((entry) => [entry.productId, entry.review])),
  );
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const selectedEntry = entries.find((entry) => entry.productId === selectedProductId) ?? null;
    const selectedReview = selectedEntry ? (reviewsByProduct[selectedEntry.productId] ?? null) : null;
    setRating(selectedReview?.rating ?? 5);
    setComment(selectedReview?.comment ?? '');
    setError(null);
    setSuccess(null);
  }, [entries, selectedProductId, reviewsByProduct]);

  const selectedEntry = entries.find((entry) => entry.productId === selectedProductId) ?? null;
  const selectedReview = selectedEntry ? (reviewsByProduct[selectedEntry.productId] ?? null) : null;
  const canEditSelected = Boolean(selectedEntry?.productSlug);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedEntry?.productSlug) return;

    setError(null);
    setSuccess(null);

    const trimmedComment = comment.trim();
    if (trimmedComment.length < 10) {
      setError(tProduct('reviews.validation_min'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(selectedEntry.productSlug)}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          comment: trimmedComment,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 401) {
          throw new Error(tProduct('reviews.error_unauthorized'));
        }
        if (response.status === 403) {
          throw new Error(tProduct('reviews.error_forbidden'));
        }
        throw new Error(payload?.error || tProduct('reviews.error_generic'));
      }

      const payload = await response.json().catch(() => null) as {
        review?: {
          id: string;
          rating: number;
          comment: string;
          created_at: string;
          updated_at: string;
        };
      } | null;
      const review = payload?.review;
      if (review) {
        setReviewsByProduct((previous) => ({
          ...previous,
          [selectedEntry.productId]: {
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.created_at,
            updatedAt: review.updated_at,
          },
        }));
      }
      setSuccess(selectedReview ? tProduct('reviews.updated') : tProduct('reviews.created'));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : tProduct('reviews.error_generic'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onDelete() {
    if (!selectedEntry?.productSlug || !selectedReview) return;

    setError(null);
    setSuccess(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/products/${encodeURIComponent(selectedEntry.productSlug)}/reviews`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 401) {
          throw new Error(tProduct('reviews.error_unauthorized'));
        }
        if (response.status === 403) {
          throw new Error(tProduct('reviews.error_forbidden'));
        }
        throw new Error(payload?.error || tProduct('reviews.error_generic'));
      }

      setReviewsByProduct((previous) => ({
        ...previous,
        [selectedEntry.productId]: null,
      }));
      setRating(5);
      setComment('');
      setSuccess(tProduct('reviews.deleted'));
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : tProduct('reviews.error_generic'));
    } finally {
      setIsDeleting(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-[28px] border border-black/10 bg-white p-6 md:p-8">
        <p className="text-base font-black text-kode01-noir">{tHub('empty_title')}</p>
        <p className="mt-2 text-sm text-kode01-noir/65">{tHub('empty_subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <aside className="rounded-[28px] border border-black/10 bg-white p-4 md:p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">{tHub('select_product')}</p>
        <div className="space-y-2">
          {entries.map((entry) => {
            const review = reviewsByProduct[entry.productId] ?? null;
            const isActive = selectedProductId === entry.productId;
            return (
              <button
                key={entry.productId}
                type="button"
                onClick={() => setSelectedProductId(entry.productId)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-kode01-pink/40 bg-kode01-pink/10'
                    : 'border-black/10 hover:border-kode01-pink/25 hover:bg-kode01-cream/30'
                }`}
              >
                <p className="line-clamp-2 text-sm font-black text-kode01-noir">{entry.productTitle}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="border-0 bg-black/5 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/60">
                    {tHub(statusLabelKey(entry.purchaseStatus))}
                  </Badge>
                  {review && (
                    <span className="text-xs font-bold text-yellow-600">
                      {STAR.repeat(review.rating)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-[28px] border border-black/10 bg-white p-6 md:p-8">
        {!selectedEntry && (
          <p className="text-sm font-medium text-kode01-noir/70">{tHub('no_selection')}</p>
        )}

        {selectedEntry && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-serif font-black text-kode01-noir">{selectedEntry.productTitle}</h2>
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
                {tHub('purchased_on', {
                  date: formatDate(selectedEntry.purchasedAt, locale),
                  status: tHub(statusLabelKey(selectedEntry.purchaseStatus)),
                })}
              </p>
            </div>

            {!canEditSelected && (
              <div className="rounded-2xl border border-black/10 bg-kode01-cream/40 px-4 py-5">
                <p className="text-sm font-bold text-kode01-noir/75">{tHub('product_unavailable')}</p>
                <p className="mt-1 text-xs text-kode01-noir/55">{tHub('product_unavailable_hint')}</p>
              </div>
            )}

            {canEditSelected && (
              <form onSubmit={onSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-kode01-noir/50 mb-3">
                    {tProduct('reviews.rating_label')}
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        aria-label={`${tProduct('reviews.rating_star')} ${value}`}
                        className={`text-2xl leading-none transition-transform ${value <= rating ? 'text-yellow-500' : 'text-kode01-noir/20'} hover:scale-110`}
                      >
                        {STAR}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="buyer-review-comment"
                    className="block text-xs font-bold uppercase tracking-widest text-kode01-noir/50 mb-3"
                  >
                    {tProduct('reviews.comment_label')}
                  </label>
                  <textarea
                    id="buyer-review-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    minLength={10}
                    maxLength={2000}
                    rows={6}
                    placeholder={tProduct('reviews.comment_placeholder')}
                    className="w-full rounded-2xl border border-black/10 px-4 py-3 text-kode01-noir placeholder:text-kode01-noir/30 focus:outline-none focus:ring-2 focus:ring-kode01-pink/20"
                  />
                </div>

                {error && (
                  <p className="text-sm font-semibold text-red-600">{error}</p>
                )}
                {success && (
                  <p className="text-sm font-semibold text-kode01-green">{success}</p>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-full bg-kode01-noir px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-kode01-pink hover:text-kode01-noir disabled:opacity-60"
                  >
                    {isSubmitting
                      ? tProduct('reviews.saving')
                      : selectedReview
                        ? tProduct('reviews.update_cta')
                        : tProduct('reviews.submit_cta')}
                  </Button>

                  {selectedReview && (
                    <Button
                      type="button"
                      onClick={onDelete}
                      disabled={isDeleting}
                      variant="outline"
                      className="rounded-full border-red-300 px-6 py-3 text-xs font-bold uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {isDeleting ? tProduct('reviews.deleting') : tProduct('reviews.delete_cta')}
                    </Button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
