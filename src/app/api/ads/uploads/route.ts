import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdsMemberRole } from '@/features/ads/server/access';
import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';
import { normalizeAndUploadImageFile } from '@/lib/images/server/core-image-pipeline';

type PlacementSlug = 'news' | 'newsletter_footer';

const PLACEMENT_SLUGS = new Set<PlacementSlug>(['news', 'newsletter_footer']);
const ACCEPTED_FORMATS = new Set<string>(adCreativeGuidelines.acceptedFormats);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!isAdsMemberRole(profile?.role)) {
      return NextResponse.json({ error: 'Advertising is restricted to members.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const placementSlugRaw = formData.get('placementSlug');
    const placementSlug = typeof placementSlugRaw === 'string' ? placementSlugRaw : null;

    if (!(file instanceof File) || !placementSlug || !PLACEMENT_SLUGS.has(placementSlug as PlacementSlug)) {
      return NextResponse.json({ error: 'Invalid upload payload' }, { status: 400 });
    }

    if (!ACCEPTED_FORMATS.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 400 });
    }

    if (file.size > adCreativeGuidelines.maxFileSizeBytes) {
      return NextResponse.json({ error: 'Image file too large' }, { status: 400 });
    }

    const admin = createAdminClient();
    const uploaded = await normalizeAndUploadImageFile({
      admin,
      bucket: 'covers',
      file,
      pathPrefix: `ads/${user.id}`,
      pathLabel: placementSlug,
      upsert: false,
      maxInputBytes: adCreativeGuidelines.maxFileSizeBytes,
    });

    return NextResponse.json({
      data: {
        placementSlug,
        path: uploaded.path,
        url: uploaded.url,
        contentType: uploaded.contentType,
        size: uploaded.bytes,
      },
    });
  } catch (error) {
    console.error('Ad upload error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
