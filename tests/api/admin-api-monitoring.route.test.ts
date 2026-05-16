import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type EventRow = {
  id: string;
  endpoint: string;
  channel: 'inbound' | 'outbound';
  method: string | null;
  status_code: number | null;
  success: boolean;
  duration_ms: number;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  event_id: string;
  event_type: string;
  endpoint_url: string;
  status: 'pending' | 'retrying' | 'sent' | 'failed' | 'cancelled';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_response_status: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

let getAdminSessionImpl: () => Promise<{ userId: string } | null> = async () => null;
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

mock.module('server-only', {
  defaultExport: {},
});

mock.module('@/app/api/admin/api-monitoring/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionImpl(),
    parseApiMonitorRange: (rawRange: string | null) => ({
      range: rawRange === '7d' || rawRange === '30d' ? rawRange : '24h',
      fromDate: new Date('2026-03-01T00:00:00.000Z'),
    }),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/admin/api-monitoring',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => undefined,
  },
});

class EventsQuery {
  private endpointEq: string | null = null;
  private successEq: boolean | null = null;
  private statusEq: number | null = null;
  private statusIn: number[] | null = null;
  private createdAtGte: string | null = null;
  private createdAtLt: string | null = null;
  private limitValue = 1000;

  constructor(private readonly rows: EventRow[]) {}

  select() {
    return this;
  }

  gte(column: string, value: string) {
    if (column === 'created_at') this.createdAtGte = value;
    return this;
  }

  lt(column: string, value: string) {
    if (column === 'created_at') this.createdAtLt = value;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  eq(column: string, value: string | boolean | number) {
    if (column === 'endpoint' && typeof value === 'string') this.endpointEq = value;
    if (column === 'success' && typeof value === 'boolean') this.successEq = value;
    if (column === 'status_code' && typeof value === 'number') this.statusEq = value;
    return this;
  }

  in(column: string, values: number[]) {
    if (column === 'status_code') this.statusIn = values;
    return this;
  }

  private execute() {
    const filtered = this.rows
      .filter((row) => (this.endpointEq ? row.endpoint === this.endpointEq : true))
      .filter((row) => (this.successEq !== null ? row.success === this.successEq : true))
      .filter((row) => (this.statusEq !== null ? row.status_code === this.statusEq : true))
      .filter((row) => (this.statusIn ? this.statusIn.includes(row.status_code ?? -1) : true))
      .filter((row) => (this.createdAtGte ? row.created_at >= this.createdAtGte : true))
      .filter((row) => (this.createdAtLt ? row.created_at < this.createdAtLt : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, this.limitValue);

    return { data: filtered, error: null };
  }

  then<TResult1 = { data: EventRow[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: EventRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

class DeliveriesQuery {
  private statusEq: string | null = null;
  private statusIn: string[] | null = null;
  private limitValue = 1000;

  constructor(private readonly rows: DeliveryRow[]) {}

  select() {
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  eq(column: string, value: string) {
    if (column === 'status') this.statusEq = value;
    return this;
  }

  in(column: string, values: string[]) {
    if (column === 'status') this.statusIn = values;
    return this;
  }

  private execute() {
    const filtered = this.rows
      .filter((row) => (this.statusEq ? row.status === this.statusEq : true))
      .filter((row) => (this.statusIn ? this.statusIn.includes(row.status) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, this.limitValue);

    return { data: filtered, error: null };
  }

  then<TResult1 = { data: DeliveryRow[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: DeliveryRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

async function loadSummaryRoute(scenario: string) {
  return import(`../../src/app/api/admin/api-monitoring/summary/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

async function loadEventsRoute(scenario: string) {
  return import(`../../src/app/api/admin/api-monitoring/events/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

async function loadDeliveriesRoute(scenario: string) {
  return import(`../../src/app/api/admin/api-monitoring/deliveries/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('summary/events/deliveries routes return 403 when admin session is missing', async () => {
  getAdminSessionImpl = async () => null;
  createAdminClientImpl = () => ({
    from: () => {
      throw new Error('createAdminClient should not be called when unauthorized');
    },
  });

  const [summaryModule, eventsModule, deliveriesModule] = await Promise.all([
    loadSummaryRoute('forbidden-summary'),
    loadEventsRoute('forbidden-events'),
    loadDeliveriesRoute('forbidden-deliveries'),
  ]);

  const summaryResponse = await summaryModule.GET(new Request('http://localhost/api/admin/api-monitoring/summary'));
  const eventsResponse = await eventsModule.GET(new Request('http://localhost/api/admin/api-monitoring/events'));
  const deliveriesResponse = await deliveriesModule.GET(new Request('http://localhost/api/admin/api-monitoring/deliveries'));

  assert.equal(summaryResponse.status, 403);
  assert.equal(eventsResponse.status, 403);
  assert.equal(deliveriesResponse.status, 403);
});

test('events route supports filters and cursor pagination', async () => {
  getAdminSessionImpl = async () => ({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

  const rows: EventRow[] = [
    {
      id: 'evt-1',
      endpoint: '/api/licenses/verify',
      channel: 'inbound',
      method: 'POST',
      status_code: 200,
      success: true,
      duration_ms: 40,
      request_id: 'req-1',
      ip_address: null,
      user_agent: null,
      metadata: {},
      created_at: '2026-03-12T11:00:00.000Z',
    },
    {
      id: 'evt-2',
      endpoint: '/api/licenses/verify',
      channel: 'inbound',
      method: 'POST',
      status_code: 429,
      success: false,
      duration_ms: 25,
      request_id: 'req-2',
      ip_address: null,
      user_agent: null,
      metadata: {},
      created_at: '2026-03-12T10:00:00.000Z',
    },
    {
      id: 'evt-3',
      endpoint: '/api/webhooks/stripe',
      channel: 'inbound',
      method: 'POST',
      status_code: 401,
      success: false,
      duration_ms: 20,
      request_id: 'req-3',
      ip_address: null,
      user_agent: null,
      metadata: {},
      created_at: '2026-03-12T09:00:00.000Z',
    },
  ];

  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'external_api_call_events');
      return new EventsQuery(rows);
    },
  });

  const eventsModule = await loadEventsRoute('events-filters');
  const response = await eventsModule.GET(
    new Request(
      'http://localhost/api/admin/api-monitoring/events?range=24h&endpoint=/api/licenses/verify&status=all&limit=1',
    ),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body.data), true);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, 'evt-1');
  assert.equal(body.nextCursor, '2026-03-12T11:00:00.000Z');

  const pagedResponse = await eventsModule.GET(
    new Request(
      `http://localhost/api/admin/api-monitoring/events?range=24h&endpoint=/api/licenses/verify&status=all&limit=1&cursor=${encodeURIComponent(body.nextCursor)}`,
    ),
  );

  assert.equal(pagedResponse.status, 200);
  const pagedBody = await pagedResponse.json();
  assert.equal(Array.isArray(pagedBody.data), true);
  assert.equal(pagedBody.data.length, 1);
  assert.equal(pagedBody.data[0].id, 'evt-2');
  assert.equal(pagedBody.nextCursor, null);
});

test('deliveries route supports status filters', async () => {
  getAdminSessionImpl = async () => ({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

  const rows: DeliveryRow[] = [
    {
      id: 'del-1',
      event_id: 'event-1',
      event_type: 'license.issued',
      endpoint_url: 'https://app.example.com/webhooks/license',
      status: 'retrying',
      attempt_count: 2,
      max_attempts: 6,
      next_attempt_at: '2026-03-12T12:00:00.000Z',
      last_attempt_at: '2026-03-12T11:59:00.000Z',
      last_response_status: 500,
      last_error: 'http_500',
      created_at: '2026-03-12T11:00:00.000Z',
      updated_at: '2026-03-12T11:59:00.000Z',
    },
    {
      id: 'del-2',
      event_id: 'event-2',
      event_type: 'license.issued',
      endpoint_url: 'https://app.example.com/webhooks/license',
      status: 'failed',
      attempt_count: 6,
      max_attempts: 6,
      next_attempt_at: '2026-03-12T11:00:00.000Z',
      last_attempt_at: '2026-03-12T10:59:00.000Z',
      last_response_status: 500,
      last_error: 'http_500',
      created_at: '2026-03-12T09:00:00.000Z',
      updated_at: '2026-03-12T10:59:00.000Z',
    },
  ];

  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'license_webhook_deliveries');
      return new DeliveriesQuery(rows);
    },
  });

  const deliveriesModule = await loadDeliveriesRoute('deliveries-filters');
  const response = await deliveriesModule.GET(
    new Request('http://localhost/api/admin/api-monitoring/deliveries?status=failed&limit=10'),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body.data), true);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, 'del-2');
});
