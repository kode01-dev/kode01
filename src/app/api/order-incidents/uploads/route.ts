import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `File type "${file.type}" is not allowed.` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit.' }, { status: 400 });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `order-incidents/${user.id}/${timestamp}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('public')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Order incident evidence upload failed:', uploadError);
      return NextResponse.json({ error: 'Upload failed. Please retry.' }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from('public').getPublicUrl(uploadData.path);
    return NextResponse.json({
      url: publicUrlData.publicUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('POST /api/order-incidents/uploads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
