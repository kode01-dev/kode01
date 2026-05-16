import { redirect } from 'next/navigation';

export default async function AdminEditorialRedirectPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  // 301 redirect to new CMS Blogs editor route
  redirect(`/${locale}/admin/cms/editor`);
}
