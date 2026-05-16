import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { EnqueuePayload } from '@/lib/agent-runtime/contracts';

let getAdminSessionOrNullImpl: () => Promise<{ userId: string } | null> = async () => null;
const executionMode = 'modal';
let shouldUseRuntime = true;
let shouldWait = false;
let receivedPayload: EnqueuePayload | null = null;

function getReceivedPayload() {
  return receivedPayload;
}

mock.module('@/app/api/admin/controllers/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionOrNullImpl(),
  },
});

mock.module('@/lib/agent-runtime/route-control', {
  namedExports: {
    getExecutionMode: () => executionMode,
    shouldUseAgentRuntime: () => shouldUseRuntime,
    shouldWaitForAgentCompletion: () => shouldWait,
    runAgentOrAccepted: async (payload: EnqueuePayload, options?: { wait?: boolean; waitTimeoutMs?: number }) => {
      receivedPayload = payload;
      return Response.json(
        {
          status: 'queued',
          jobId: 'job-seo-blog-1',
          wait: options?.wait ?? false,
          waitTimeoutMs: options?.waitTimeoutMs,
        },
        { status: 202 },
      );
    },
  },
});

async function loadPost(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/admin/seo-blog-agent/run/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST as (request: Request) => Promise<Response>;
}

test('POST /api/admin/seo-blog-agent/run returns 403 when not admin', async () => {
  getAdminSessionOrNullImpl = async () => null;
  receivedPayload = null;

  const POST = await loadPost('forbidden');
  const response = await POST(
    new Request('http://localhost/api/admin/seo-blog-agent/run', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(receivedPayload, null);
});

test('POST /api/admin/seo-blog-agent/run validates required blog input', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  receivedPayload = null;

  const POST = await loadPost('invalid');
  const response = await POST(
    new Request('http://localhost/api/admin/seo-blog-agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          keyword: '',
          title: '',
          locale: 'fr',
        },
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(receivedPayload, null);
});

test('POST /api/admin/seo-blog-agent/run requires Modal runtime', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  shouldUseRuntime = false;
  receivedPayload = null;

  const POST = await loadPost('runtime-required');
  const response = await POST(
    new Request('http://localhost/api/admin/seo-blog-agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          keyword: 'langgraph seo',
          title: 'LangGraph SEO',
          locale: 'fr',
        },
      }),
    }),
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'MODAL_RUNTIME_REQUIRED');
  assert.equal(receivedPayload, null);
  shouldUseRuntime = true;
});

test('POST /api/admin/seo-blog-agent/run enqueues seo-blog-writer generate job', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  shouldUseRuntime = true;
  shouldWait = true;
  receivedPayload = null;

  const POST = await loadPost('success');
  const response = await POST(
    new Request('http://localhost/api/admin/seo-blog-agent/run?wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'seo-blog-request-1',
      },
      body: JSON.stringify({
        profileId: '11111111-1111-4111-8111-111111111111',
        saveToCms: true,
        input: {
          keyword: 'langgraph seo',
          title: 'LangGraph SEO',
          locale: 'fr',
          internalLinks: ['https://example.com/blog'],
        },
      }),
    }),
  );

  assert.equal(response.status, 202);
  const payload = getReceivedPayload();
  assert.ok(payload);
  assert.equal(payload.flow, 'seo-blog-writer');
  assert.equal(payload.mode, 'generate');
  assert.equal(payload.trigger, 'manual');
  assert.equal(payload.profileId, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.requestId, 'seo-blog-request-1');
  assert.equal(payload.userId, 'admin-user');
  assert.equal(payload.saveToCms, true);
  assert.deepEqual(payload.input?.internalLinks, ['https://example.com/blog']);
  shouldWait = false;
});
