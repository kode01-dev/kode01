import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';
import type { PlacementAssetState, PlacementSlug } from './adsCampaignLauncher.types';

export const ACCEPTED_MIME_FORMATS = new Set<string>(adCreativeGuidelines.acceptedFormats);
export const ACCEPTED_FILE_FORMAT_LABEL = adCreativeGuidelines.acceptedFormats
  .map((value) => value.replace('image/', '').toUpperCase())
  .join(', ');
export const MAX_FILE_SIZE_MB = (adCreativeGuidelines.maxFileSizeBytes / 1_000_000).toFixed(1);
export const FILE_INPUT_ACCEPT = adCreativeGuidelines.acceptedFormats.join(',');

function createEmptyAssetState(): PlacementAssetState {
  return {
    file: null,
    uploadedUrl: null,
    width: null,
    height: null,
  };
}

export function createInitialAssetStates(): Record<PlacementSlug, PlacementAssetState> {
  return {
    news: createEmptyAssetState(),
    newsletter_footer: createEmptyAssetState(),
  };
}

export function formatMoney(value: number, locale: string, currency: string) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value.toFixed(2)));
}

export function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function collectErrorMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectErrorMessages(entry));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectErrorMessages(entry));
  }
  return [];
}

export function normalizeApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;

  const record = payload as Record<string, unknown>;
  const detailsMessages = collectErrorMessages(record.details);
  const details = detailsMessages.filter(Boolean).join(' ');
  const error = typeof record.error === 'string' ? record.error : '';

  if (details && error) return `${error}: ${details}`;
  if (details) return details;
  if (error) return error;
  return fallback;
}

export async function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      reject(new Error('invalid_image'));
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}
