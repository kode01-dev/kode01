import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/zip',
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
]);

const UPLOAD_KINDS = new Set(['cover', 'gallery', 'digital_file']);

function normalizeUploadKind(value: FormDataEntryValue | null, fileType: string): 'cover' | 'gallery' | 'digital_file' {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (UPLOAD_KINDS.has(raw)) return raw as 'cover' | 'gallery' | 'digital_file';
  return fileType.startsWith('image/') ? 'cover' : 'digital_file';
}

function buildSafeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 120);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify seller role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const kind = normalizeUploadKind(formData.get('kind'), file.type);
    const isImageUpload = kind === 'cover' || kind === 'gallery';

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `File type "${file.type}" is not allowed.` }, { status: 400 });
    }

    if (isImageUpload && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files can be uploaded as product media.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit.' }, { status: 400 });
    }

    const bucket = isImageUpload ? 'covers' : 'vault';
    const timestamp = Date.now();
    const safeName = buildSafeFileName(file.name);
    const filePath = `${kind}/${user.id}/${timestamp}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed. Please retry.' }, { status: 500 });
    }

    const publicUrl = isImageUpload
      ? supabase.storage.from(bucket).getPublicUrl(uploadData.path).data.publicUrl
      : null;

    return NextResponse.json({
      kind,
      bucket,
      path: uploadData.path,
      ...(publicUrl ? { publicUrl, url: publicUrl } : {}),
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Upload route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
