import 'server-only';

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getAppBaseUrl } from '@/lib/env/server';
import { fetchWithServerSideUrlSafety } from '@/lib/security/server-url-safety';

export type CoreImageBucket = 'covers' | 'editorial';

type StorageUploadResult = {
  data: { path: string } | null;
  error: { message?: string } | null;
};

export type StorageUploader = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean },
      ) => Promise<StorageUploadResult>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

type NormalizeOptions = {
  maxLongEdge?: number;
  webpQuality?: number;
  timeoutMs?: number;
  maxInputBytes?: number;
  upsert?: boolean;
};

type UploadCoreImageFromBufferInput = NormalizeOptions & {
  admin: StorageUploader;
  bucket: CoreImageBucket;
  sourceBuffer: Buffer;
  pathPrefix: string;
  pathLabel?: string;
};

type UploadCoreImageFromFileInput = NormalizeOptions & {
  admin: StorageUploader;
  bucket: CoreImageBucket;
  file: File;
  pathPrefix: string;
  pathLabel?: string;
};

type UploadCoreImageFromUrlInput = NormalizeOptions & {
  admin: StorageUploader;
  bucket: CoreImageBucket;
  sourceUrl: string;
  pathPrefix: string;
  pathLabel?: string;
  userAgent?: string;
};

export type UploadedCoreImage = {
  bucket: CoreImageBucket;
  path: string;
  url: string;
  contentType: 'image/webp';
  bytes: number;
  sourceBytes: number;
  width: number | null;
  height: number | null;
};

const DEFAULT_MAX_LONG_EDGE = 1600;
const DEFAULT_WEBP_QUALITY = 78;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_INPUT_BYTES = 12 * 1024 * 1024;
const PUBLIC_STORAGE_PATH_PREFIX = '/storage/v1/object/public/';

function sanitizePathSegment(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return cleaned || 'images';
}

function buildStoragePath(pathPrefix: string, pathLabel?: string): string {
  const prefix = sanitizePathSegment(pathPrefix);
  const label = sanitizePathSegment(pathLabel ?? 'asset').replace(/\//g, '-').slice(0, 48);
  return `${prefix}/${Date.now()}-${randomUUID()}-${label}.webp`;
}

function toAppHostedStorageUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!parsed.pathname.startsWith(PUBLIC_STORAGE_PATH_PREFIX)) {
      return value;
    }

    const appBaseUrl = getAppBaseUrl();
    const appOrigin = new URL(appBaseUrl).origin;
    return `${appOrigin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

export function isOptimizedPublicStorageUrl(url: string, bucket: CoreImageBucket): boolean {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    return parsed.pathname.includes(marker) && parsed.pathname.toLowerCase().endsWith('.webp');
  } catch {
    return false;
  }
}

function ensureImageBytes(sourceBuffer: Buffer, maxInputBytes: number): void {
  if (sourceBuffer.length <= 0) {
    throw new Error('Image payload is empty.');
  }
  if (sourceBuffer.length > maxInputBytes) {
    throw new Error(`Image payload exceeds ${maxInputBytes} bytes.`);
  }
}

async function normalizeToWebp(
  sourceBuffer: Buffer,
  maxLongEdge: number,
  webpQuality: number,
): Promise<{ outputBuffer: Buffer; width: number | null; height: number | null }> {
  const outputBuffer = await sharp(sourceBuffer, { failOn: 'none', limitInputPixels: 10000 * 10000 })
    .rotate()
    .resize({
      width: maxLongEdge,
      height: maxLongEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: webpQuality, effort: 4 })
    .toBuffer();

  if (outputBuffer.length <= 0) {
    throw new Error('Image optimization produced an empty output.');
  }

  const metadata = await sharp(outputBuffer, { failOn: 'none' }).metadata();
  return {
    outputBuffer,
    width: typeof metadata.width === 'number' ? metadata.width : null,
    height: typeof metadata.height === 'number' ? metadata.height : null,
  };
}

async function uploadBufferAsWebp(input: UploadCoreImageFromBufferInput): Promise<UploadedCoreImage> {
  const {
    admin,
    bucket,
    sourceBuffer,
    pathPrefix,
    pathLabel,
    maxLongEdge = DEFAULT_MAX_LONG_EDGE,
    webpQuality = DEFAULT_WEBP_QUALITY,
    maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
    upsert = false,
  } = input;

  ensureImageBytes(sourceBuffer, maxInputBytes);
  const { outputBuffer, width, height } = await normalizeToWebp(sourceBuffer, maxLongEdge, webpQuality);
  const path = buildStoragePath(pathPrefix, pathLabel);

  const { data, error } = await admin.storage.from(bucket).upload(path, outputBuffer, {
    contentType: 'image/webp',
    upsert,
  });
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to upload optimized image.');
  }

  const { data: publicUrlData } = admin.storage.from(bucket).getPublicUrl(data.path);
  if (!publicUrlData?.publicUrl) {
    throw new Error('Failed to resolve optimized image public URL.');
  }

  return {
    bucket,
    path: data.path,
    url: toAppHostedStorageUrl(publicUrlData.publicUrl),
    contentType: 'image/webp',
    bytes: outputBuffer.length,
    sourceBytes: sourceBuffer.length,
    width,
    height,
  };
}

export async function normalizeAndUploadImageFile(input: UploadCoreImageFromFileInput): Promise<UploadedCoreImage> {
  const sourceBuffer = Buffer.from(await input.file.arrayBuffer());
  return uploadBufferAsWebp({ ...input, sourceBuffer });
}

export async function normalizeAndUploadImageUrl(input: UploadCoreImageFromUrlInput): Promise<UploadedCoreImage> {
  const {
    sourceUrl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
    userAgent = 'Mozilla/5.0',
  } = input;

  const { response, finalUrl } = await fetchWithServerSideUrlSafety(sourceUrl, {
    dependency: 'remote_image_normalization',
    timeoutMs,
    userAgent,
    maxRedirects: 3,
  });
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status}) for ${finalUrl.toString()}`);
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Fetched content is not an image (${contentType || 'unknown type'}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const sourceBuffer = Buffer.from(arrayBuffer);
  ensureImageBytes(sourceBuffer, maxInputBytes);

  return uploadBufferAsWebp({ ...input, sourceBuffer, maxInputBytes });
}

export async function ensureOptimizedStorageImageUrl(input: UploadCoreImageFromUrlInput): Promise<string> {
  if (isOptimizedPublicStorageUrl(input.sourceUrl, input.bucket)) {
    return toAppHostedStorageUrl(input.sourceUrl);
  }

  const uploaded = await normalizeAndUploadImageUrl(input);
  return toAppHostedStorageUrl(uploaded.url);
}
