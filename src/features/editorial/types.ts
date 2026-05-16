export type EditorialLocale = 'en' | 'fr';

export type EditorialStatus = 'draft' | 'published';

export type EditorialSponsoredStatus =
  | 'none'
  | 'pending_payment'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type EditorialPostListItem = {
  id: string;
  translation_group_id: string;
  source_locale: EditorialLocale;
  locale: EditorialLocale;
  status: EditorialStatus;
  is_sponsored: boolean;
  sponsorship_status: EditorialSponsoredStatus;
  sponsored_owner_user_id: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_approved_by: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejected_by: string | null;
  sponsored_rejection_reason: string | null;
  slug: string;
  category: string | null;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  clap_count?: number;
};

export type EditorialPostDetail = EditorialPostListItem & {
  content_markdown: string;
  seo_title: string | null;
  seo_description: string | null;
};
