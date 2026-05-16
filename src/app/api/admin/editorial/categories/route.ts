import { NextResponse } from 'next/server';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';

type CategoryRow = {
  category: string | null;
};

export async function GET(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { admin } = adminSession;
    const { data, error } = await admin
      .from('editorial_posts')
      .select('category')
      .not('category', 'is', null)
      .order('category', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const categories = Array.from(
      new Set(
        ((data ?? []) as CategoryRow[])
          .map((row) => (typeof row.category === 'string' ? row.category.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );

    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error('GET /api/admin/editorial/categories error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
