import { redirect } from 'next/navigation';

export default async function AdminSecurityAliasPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  redirect(`/${locale}/admin/bot-activity`);
}
