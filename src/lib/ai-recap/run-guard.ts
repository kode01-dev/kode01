import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AiRecapRunBlockReason = 'kill_switch' | 'flow_disabled' | 'schedule_disabled';

export type AiRecapRunBlock = {
  reason: AiRecapRunBlockReason;
  code: 'AI_RECAP_RUNS_DISABLED';
  message: string;
};

const WEEKLY_RECAP_FLOW = 'weekly-ai-recap';

function parseBoolean(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function disabledFlowsIncludesWeeklyRecap(value: string | undefined): boolean {
  if (!value) return false;
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .includes(WEEKLY_RECAP_FLOW);
}

export function getAiRecapEnvRunBlock(): AiRecapRunBlock | null {
  if (parseBoolean(process.env.AGENT_CRON_KILL_SWITCH)) {
    return {
      reason: 'kill_switch',
      code: 'AI_RECAP_RUNS_DISABLED',
      message: 'AI recap runs are disabled by the global kill switch.',
    };
  }

  if (
    parseBoolean(process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP) ||
    disabledFlowsIncludesWeeklyRecap(process.env.AGENT_CRON_DISABLED_FLOWS)
  ) {
    return {
      reason: 'flow_disabled',
      code: 'AI_RECAP_RUNS_DISABLED',
      message: 'AI recap runs are disabled for weekly-ai-recap.',
    };
  }

  return null;
}

export async function getAiRecapRunBlock(supabase: SupabaseServerClient): Promise<AiRecapRunBlock | null> {
  const envBlock = getAiRecapEnvRunBlock();
  if (envBlock) return envBlock;

  const { data, error } = await supabase
    .from('ai_recap_schedule_settings')
    .select('is_enabled')
    .eq('id', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.is_enabled === false) {
    return {
      reason: 'schedule_disabled',
      code: 'AI_RECAP_RUNS_DISABLED',
      message: 'AI recap schedule is disabled.',
    };
  }

  return null;
}
