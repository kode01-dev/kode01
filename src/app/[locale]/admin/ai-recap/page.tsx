import { redirect } from 'next/navigation';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { AiRecapAdminPanel } from '@/features/ai-recap/components/AiRecapAdminPanel';
import type { RunItem, ScheduleItem, SourceItem } from '@/features/ai-recap/components/AiRecapAdminPanel';
import { getTranslations } from 'next-intl/server';

const scheduleSelect =
  'id, is_enabled, timezone, slot_a_day, slot_a_hour, slot_a_minute, slot_b_day, slot_b_hour, slot_b_minute, slot_c_day, slot_c_hour, slot_c_minute, slot_d_day, slot_d_hour, slot_d_minute, slot_e_day, slot_e_hour, slot_e_minute, created_at, updated_at';

export default function AdminAiRecapPage(
  props: { params: Promise<{ locale: string }> },
) {
  return <AdminAiRecapContent paramsPromise={props.params} />;
}

async function AdminAiRecapContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ locale: string }>;
}) {
  const { locale } = await paramsPromise;
  const t = await getTranslations('dashboard.admin');
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

  if (profile?.role !== 'admin') {
    redirect(`/${locale}/admin`);
  }

  const [{ data: sources }, { data: runs, count: totalRuns }, { data: schedule }] = await Promise.all([
    supabase
      .from('ai_recap_sources')
      .select('id, name, url, feed_url, domain, priority, is_active, locale_hint, scrape_route, rss_allow_firecrawl_fallback, created_at, updated_at')
      .order('priority', { ascending: false }),
    supabase
      .from('ai_recap_runs')
      .select('id, edition_key, trigger_type, attempt, status, started_at, finished_at, error_message', { count: 'exact' })
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('ai_recap_schedule_settings')
      .select(scheduleSelect)
      .eq('id', true)
      .maybeSingle(),
  ]);

  let ensuredSchedule = schedule;
  if (!ensuredSchedule) {
    const { data: insertedSchedule, error: insertScheduleError } = await supabase
      .from('ai_recap_schedule_settings')
      .insert({ id: true })
      .select(scheduleSelect)
      .single();

    if (insertScheduleError) {
      const { data: reloadedSchedule } = await supabase
        .from('ai_recap_schedule_settings')
        .select(scheduleSelect)
        .eq('id', true)
        .maybeSingle();
      ensuredSchedule = reloadedSchedule;
    } else {
      ensuredSchedule = insertedSchedule;
    }
  }

  if (!ensuredSchedule) {
    redirect(`/${locale}/admin`);
  }

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title={t('ai_recap_title')}
      subtitle={t('ai_recap_subtitle')}
    >
      <AiRecapAdminPanel
        locale={locale}
        initialSources={(sources ?? []) as SourceItem[]}
        initialRuns={(runs ?? []) as RunItem[]}
        initialTotalRuns={totalRuns ?? 0}
        initialSchedule={ensuredSchedule as ScheduleItem}
      />
    </DashboardShell>
  );
}
