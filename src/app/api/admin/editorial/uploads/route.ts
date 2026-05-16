import { NextResponse } from 'next/server';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';
import { normalizeAndUploadImageFile } from '@/lib/images/server/core-image-pipeline';

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const EDITORIAL_BUCKET = 'editorial';

export async function POST(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
    }

    const { admin, userId } = adminSession;
    const uploaded = await normalizeAndUploadImageFile({
      admin,
      bucket: EDITORIAL_BUCKET,
      file,
      pathPrefix: `editorial/${userId}`,
      pathLabel: 'cover',
      upsert: false,
      maxInputBytes: MAX_FILE_BYTES,
    });

    return NextResponse.json({
      data: {
        bucket: uploaded.bucket,
        path: uploaded.path,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.bytes,
      },
    });
  } catch (error) {
    console.error('POST /api/admin/editorial/uploads error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
