import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAiRecapEnvRunBlock,
  getAiRecapRunBlock,
} from '@/lib/ai-recap/run-guard';

function restoreEnv(original: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(original)) {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeScheduleClient(isEnabled: boolean | null) {
  return {
    from(table: string) {
      assert.equal(table, 'ai_recap_schedule_settings');
      return {
        select(columns: string) {
          assert.equal(columns, 'is_enabled');
          return {
            eq(column: string, value: boolean) {
              assert.equal(column, 'id');
              assert.equal(value, true);
              return {
                async maybeSingle() {
                  return {
                    data: isEnabled === null ? null : { is_enabled: isEnabled },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('getAiRecapEnvRunBlock applies the existing weekly recap kill switches', () => {
  const original = {
    AGENT_CRON_KILL_SWITCH: process.env.AGENT_CRON_KILL_SWITCH,
    AGENT_CRON_DISABLE_WEEKLY_RECAP: process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP,
    AGENT_CRON_DISABLED_FLOWS: process.env.AGENT_CRON_DISABLED_FLOWS,
  };

  try {
    process.env.AGENT_CRON_KILL_SWITCH = 'true';
    delete process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    delete process.env.AGENT_CRON_DISABLED_FLOWS;
    assert.equal(getAiRecapEnvRunBlock()?.reason, 'kill_switch');

    delete process.env.AGENT_CRON_KILL_SWITCH;
    process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP = 'true';
    assert.equal(getAiRecapEnvRunBlock()?.reason, 'flow_disabled');

    delete process.env.AGENT_CRON_DISABLE_WEEKLY_RECAP;
    process.env.AGENT_CRON_DISABLED_FLOWS = 'send-emails, weekly-ai-recap';
    assert.equal(getAiRecapEnvRunBlock()?.reason, 'flow_disabled');
  } finally {
    restoreEnv(original);
  }
});

test('getAiRecapRunBlock blocks article/newsletter runs when the recap schedule is disabled', async () => {
  const block = await getAiRecapRunBlock(makeScheduleClient(false) as never);

  assert.equal(block?.reason, 'schedule_disabled');
  assert.equal(block?.code, 'AI_RECAP_RUNS_DISABLED');
});

test('getAiRecapRunBlock allows runs when the schedule is enabled or missing', async () => {
  assert.equal(await getAiRecapRunBlock(makeScheduleClient(true) as never), null);
  assert.equal(await getAiRecapRunBlock(makeScheduleClient(null) as never), null);
});
