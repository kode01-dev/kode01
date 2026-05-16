import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_FLOWS,
  isSeoBlogWriterMode,
  resolveIdempotencyKey,
  withIdempotencyKey,
} from '@/lib/agent-runtime/contracts';

test('idempotency key is derived from request id when present', () => {
  const key = resolveIdempotencyKey({
    flow: 'weekly-ai-recap',
    mode: 'tick',
    requestId: 'req-1234',
  });

  assert.equal(key, 'req:req-1234');
});

test('weekly recap idempotency key is deterministic by edition/mode when request id is absent', () => {
  const payload = {
    flow: 'weekly-ai-recap' as const,
    mode: 'send_newsletter' as const,
    editionKey: '2026-W13-FRI',
    trigger: 'cron' as const,
  };

  const first = resolveIdempotencyKey(payload);
  const second = resolveIdempotencyKey(payload);
  assert.equal(first, second);
  assert.equal(first.includes('weekly-ai-recap:send_newsletter:2026-w13-fri:cron'), true);
});

test('seo blog writer flow and generate mode are registered', () => {
  assert.equal(AGENT_FLOWS.includes('seo-blog-writer'), true);
  assert.equal(isSeoBlogWriterMode('generate'), true);
  assert.equal(isSeoBlogWriterMode('tick'), false);
});

test('seo blog writer idempotency key is deterministic by profile, locale and keyword', () => {
  const payload = {
    flow: 'seo-blog-writer' as const,
    mode: 'generate' as const,
    profileId: 'profile-123',
    input: {
      keyword: 'LangGraph SEO Agent',
      locale: 'fr',
    },
    trigger: 'manual' as const,
  };

  const first = resolveIdempotencyKey(payload);
  const second = resolveIdempotencyKey(payload);
  assert.equal(first, second);
  assert.equal(first.includes('seo-blog-writer:generate:profile-123:fr:langgraph-seo-agent:manual'), true);
});

test('seo blog writer idempotency key still prioritizes explicit request id', () => {
  const key = resolveIdempotencyKey({
    flow: 'seo-blog-writer',
    mode: 'generate',
    requestId: 'blog-run-001',
    profileId: 'ignored-profile',
    input: {
      keyword: 'ignored keyword',
      locale: 'fr',
    },
  });

  assert.equal(key, 'req:blog-run-001');
});

test('withIdempotencyKey preserves explicit keys after normalization', () => {
  const payload = withIdempotencyKey({
    flow: 'weekly-ai-recap' as const,
    mode: 'tick' as const,
    idempotencyKey: '  Custom_Key__123 ',
  });

  assert.equal(payload.idempotencyKey, 'custom_key__123');
});
