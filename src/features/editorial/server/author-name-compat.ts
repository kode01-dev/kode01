import type { PostgrestError } from '@supabase/supabase-js';
import type { EditorialSponsoredStatus } from '@/features/editorial/types';

const BASE_LIST_COLUMNS = [
  'id',
  'translation_group_id',
  'source_locale',
  'locale',
  'status',
  'slug',
  'category',
  'title',
  'excerpt',
  'cover_image_url',
  'published_at',
  'created_at',
  'updated_at',
] as const;

const SPONSORED_COLUMNS = [
  'is_sponsored',
  'sponsorship_status',
  'sponsored_owner_user_id',
  'sponsored_submitted_at',
  'sponsored_approved_at',
  'sponsored_approved_by',
  'sponsored_rejected_at',
  'sponsored_rejected_by',
  'sponsored_rejection_reason',
] as const;

const AUTHOR_NAME_COLUMN = 'author_name';
const CLAP_COUNT_COLUMN = 'clap_count';
const SPONSORED_STATUSES = new Set<EditorialSponsoredStatus>([
  'none',
  'pending_payment',
  'pending_review',
  'approved',
  'rejected',
]);

export const EDITORIAL_LIST_SELECT = [
  ...BASE_LIST_COLUMNS.slice(0, 5),
  ...SPONSORED_COLUMNS,
  AUTHOR_NAME_COLUMN,
  ...BASE_LIST_COLUMNS.slice(5),
  CLAP_COUNT_COLUMN,
].join(', ');
export const EDITORIAL_LIST_SELECT_LEGACY = BASE_LIST_COLUMNS.join(', ');
export const EDITORIAL_DETAIL_SELECT = `${EDITORIAL_LIST_SELECT}, content_markdown, seo_title, seo_description`;
export const EDITORIAL_DETAIL_SELECT_LEGACY = `${EDITORIAL_LIST_SELECT_LEGACY}, content_markdown, seo_title, seo_description`;

export function isMissingAuthorNameColumnError(error: Pick<PostgrestError, 'code' | 'message'> | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    (message.includes('author_name') && message.includes('does not exist'))
    || (message.includes('is_sponsored') && message.includes('does not exist'))
    || (message.includes('sponsorship_status') && message.includes('does not exist'))
    || (message.includes('sponsored_owner_user_id') && message.includes('does not exist'))
    || (message.includes('sponsored_submitted_at') && message.includes('does not exist'))
    || (message.includes('sponsored_approved_at') && message.includes('does not exist'))
    || (message.includes('sponsored_approved_by') && message.includes('does not exist'))
    || (message.includes('sponsored_rejected_at') && message.includes('does not exist'))
    || (message.includes('sponsored_rejected_by') && message.includes('does not exist'))
    || (message.includes('sponsored_rejection_reason') && message.includes('does not exist'))
    || (message.includes('clap_count') && message.includes('does not exist'))
  );
}

function normalizeSponsorshipStatus(value: unknown): EditorialSponsoredStatus {
  if (typeof value !== 'string') return 'none';
  return SPONSORED_STATUSES.has(value as EditorialSponsoredStatus)
    ? (value as EditorialSponsoredStatus)
    : 'none';
}

export function normalizeAuthorNameRow<T extends Record<string, unknown>>(row: T): T & {
  author_name: string | null;
  is_sponsored: boolean;
  sponsorship_status: EditorialSponsoredStatus;
  sponsored_owner_user_id: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_approved_by: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejected_by: string | null;
  sponsored_rejection_reason: string | null;
  clap_count: number;
} {
  return {
    ...row,
    author_name: typeof row.author_name === 'string' ? row.author_name : null,
    is_sponsored: row.is_sponsored === true,
    sponsorship_status: normalizeSponsorshipStatus(row.sponsorship_status),
    sponsored_owner_user_id: typeof row.sponsored_owner_user_id === 'string' ? row.sponsored_owner_user_id : null,
    sponsored_submitted_at: typeof row.sponsored_submitted_at === 'string' ? row.sponsored_submitted_at : null,
    sponsored_approved_at: typeof row.sponsored_approved_at === 'string' ? row.sponsored_approved_at : null,
    sponsored_approved_by: typeof row.sponsored_approved_by === 'string' ? row.sponsored_approved_by : null,
    sponsored_rejected_at: typeof row.sponsored_rejected_at === 'string' ? row.sponsored_rejected_at : null,
    sponsored_rejected_by: typeof row.sponsored_rejected_by === 'string' ? row.sponsored_rejected_by : null,
    sponsored_rejection_reason: typeof row.sponsored_rejection_reason === 'string' ? row.sponsored_rejection_reason : null,
    clap_count: typeof row.clap_count === 'number' ? row.clap_count : 0,
  };
}

export function normalizeAuthorNameRows<T extends Record<string, unknown>>(rows: T[]): Array<T & {
  author_name: string | null;
  is_sponsored: boolean;
  sponsorship_status: EditorialSponsoredStatus;
  sponsored_owner_user_id: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_approved_by: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejected_by: string | null;
  sponsored_rejection_reason: string | null;
  clap_count: number;
}> {
  return rows.map((row) => normalizeAuthorNameRow(row));
}

export function withoutAuthorName<T extends Record<string, unknown>>(payload: T): Omit<T, 'author_name'> {
  const rest = { ...payload } as T & { author_name?: unknown };
  delete rest.author_name;
  return rest as Omit<T, 'author_name'>;
}
