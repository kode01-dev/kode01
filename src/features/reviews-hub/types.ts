export type ReviewHubPurchaseStatus = 'completed' | 'refunded';

export type ReviewHubReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewHubEntry = {
  purchaseId: string;
  purchaseStatus: ReviewHubPurchaseStatus;
  purchasedAt: string;
  productId: string;
  productSlug: string | null;
  productTitle: string;
  review: ReviewHubReview | null;
};

