import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type ResolveCreativeTargetInput = {
  campaignId: string;
  creativeId: string;
  placementSlug: 'free' | 'news' | 'newsletter_footer';
};

type ResolveCreativeTargetOutput = {
  destinationUrl: string;
  destinationKind: 'internal' | 'external';
} | null;

let resolveCreativeClickTargetImpl: (input: ResolveCreativeTargetInput) => Promise<ResolveCreativeTargetOutput> = async () => null;
let recordAdEventImpl: (payload: Record<string, unknown>) => Promise<void> = async () => {};

mock.module('@/features/ads/server/repository', {
  namedExports: {
    resolveCreativeClickTarget: (input: ResolveCreativeTargetInput) => resolveCreativeClickTargetImpl(input),
    recordAdEvent: (payload: Record<string, unknown>) => recordAdEventImpl(payload),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/ads/click/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

function makeRequest(query: string) {
  return new Request(`http://localhost/api/ads/click?${query}`);
}

const VALID_CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CREATIVE_ID = '22222222-2222-4222-8222-222222222222';

test('redirect uses server-resolved target and ignores user-supplied target param', async () => {
  let trackedTarget: string | null = null;
  recordAdEventImpl = async (payload: Record<string, unknown>) => {
    const metadata = payload.metadata as { target?: string } | undefined;
    trackedTarget = metadata?.target ?? null;
  };
  resolveCreativeClickTargetImpl = async () => ({
    destinationUrl: '/safe-destination?ok=1',
    destinationKind: 'internal',
  });

  const GET = await loadGetHandler('ads-click-safe-target');
  const response = await GET(
    makeRequest(
      `campaignId=${VALID_CAMPAIGN_ID}&creativeId=${VALID_CREATIVE_ID}&placement=news&target=//evil.example`,
    ),
  );

  assert.equal(response.status, 302);
  const location = response.headers.get('location') ?? '';
  assert.equal(location.endsWith('/safe-destination?ok=1') || location === '/safe-destination?ok=1', true);
  assert.equal(trackedTarget, '/safe-destination?ok=1');
});

test('returns 400 when resolved target is invalid', async () => {
  resolveCreativeClickTargetImpl = async () => ({
    destinationUrl: '//evil.example',
    destinationKind: 'internal',
  });
  recordAdEventImpl = async () => {};

  const GET = await loadGetHandler('ads-click-invalid-target');
  const response = await GET(
    makeRequest(`campaignId=${VALID_CAMPAIGN_ID}&creativeId=${VALID_CREATIVE_ID}&placement=news`),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid redirect target' });
});

test('returns 404 when creative target cannot be resolved', async () => {
  resolveCreativeClickTargetImpl = async () => null;
  recordAdEventImpl = async () => {};

  const GET = await loadGetHandler('ads-click-not-found');
  const response = await GET(
    makeRequest(`campaignId=${VALID_CAMPAIGN_ID}&creativeId=${VALID_CREATIVE_ID}&placement=news`),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Creative target not found' });
});
