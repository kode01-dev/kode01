import assert from 'node:assert/strict';
import test from 'node:test';

const ORIGINAL_ENV = { ...process.env };
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

function resetEnv() {
  for (const key of Object.keys(MUTABLE_ENV)) {
    delete MUTABLE_ENV[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    MUTABLE_ENV[key] = value;
  }
}

test('unsupported execution mode falls back to vercel runtime', async () => {
  resetEnv();
  MUTABLE_ENV.NODE_ENV = 'production';
  MUTABLE_ENV.AGENT_EXECUTION_MODE = 'legacy';
  MUTABLE_ENV.MODAL_AGENT_API_URL = 'https://runtime.example.com';
  MUTABLE_ENV.AGENT_INTERNAL_TOKEN = 'primary-secret-token';

  const { getAgentRuntimeEnv } = await import(
    `../../src/lib/agent-runtime/env.ts?case=fallback-vercel-${Date.now()}-${Math.random()}`
  );

  const env = getAgentRuntimeEnv();
  assert.equal(env.mode, 'vercel');
});

test('modal runtime is considered available when secondary token is configured', async () => {
  resetEnv();
  MUTABLE_ENV.NODE_ENV = 'production';
  MUTABLE_ENV.AGENT_EXECUTION_MODE = 'modal';
  MUTABLE_ENV.MODAL_AGENT_API_URL = 'https://runtime.example.com';
  delete MUTABLE_ENV.AGENT_INTERNAL_TOKEN;
  MUTABLE_ENV.AGENT_INTERNAL_TOKEN_NEXT = 'rotating-next-token';

  const { canUseModalRuntime, getAgentRuntimeEnv } = await import(
    `../../src/lib/agent-runtime/env.ts?case=next-token-${Date.now()}-${Math.random()}`
  );

  const env = getAgentRuntimeEnv();
  assert.equal(canUseModalRuntime(env), true);
});
