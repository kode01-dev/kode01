import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Soc2LogsTable } from '@/features/admin/soc2-logs/components/Soc2LogsTable';
import { Soc2LogsFilters } from '@/features/admin/soc2-logs/components/Soc2LogsFilters';
import { LogRow } from '@/features/admin/soc2-logs/types';
import { isAdminRole } from '@/lib/auth/roles';

function toIsoStartOfDay(dateValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  return `${dateValue}T00:00:00.000Z`;
}

function toIsoEndOfDay(dateValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  return `${dateValue}T23:59:59.999Z`;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default async function AdminSoc2LogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    event?: string;
    user?: string;
    from?: string;
    to?: string;
    exact?: string;
  }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const q = (resolvedSearchParams.q ?? '').trim();
  const event = (resolvedSearchParams.event ?? '').trim();
  const userId = (resolvedSearchParams.user ?? '').trim();
  const fromDate = (resolvedSearchParams.from ?? '').trim();
  const toDate = (resolvedSearchParams.to ?? '').trim();
  const exactEvent = resolvedSearchParams.exact === '1';

  const t = await getTranslations('admin.soc2_logs');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    redirect(`/${locale}/admin`);
  }

  let query = supabase
    .from('audit_logs')
    .select('id, event_type, user_id, ip_address, user_agent, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (event) {
    query = exactEvent
      ? query.eq('event_type', event)
      : query.ilike('event_type', `%${event}%`);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const fromIso = toIsoStartOfDay(fromDate);
  if (fromIso) {
    query = query.gte('created_at', fromIso);
  }

  const toIso = toIsoEndOfDay(toDate);
  if (toIso) {
    query = query.lte('created_at', toIso);
  }

  const { data, error } = await query;
  const rawRows = (data ?? []) as LogRow[];
  
  const rows = rawRows.filter((row) => {
    if (!q) return true;
    const haystack = [
      row.event_type,
      row.user_id ?? '',
      row.ip_address ?? '',
      row.user_agent ?? '',
      toText(row.metadata),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value))),
  );

  const profileMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);

    for (const item of profileRows ?? []) {
      const name = typeof item.display_name === 'string' && item.display_name.trim().length > 0
        ? item.display_name
        : item.id.slice(0, 8);
      profileMap.set(item.id, name);
    }
  }

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      <div className="mt-6 space-y-6">
        <Soc2LogsFilters
          locale={locale}
          defaultValues={{
            q,
            event,
            user: userId,
            from: fromDate,
            to: toDate,
            exact: exactEvent,
          }}
        />

        <Soc2LogsTable
          rows={rows}
          profileMap={profileMap}
          locale={locale}
          error={!!error}
        />
      </div>
    </DashboardShell>
  );
}
