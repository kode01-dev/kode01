import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateCampaignEvents,
  buildCampaignStatsResponse,
  type CampaignStatsEventAggregate,
} from '../../src/features/ads/server/campaign-stats';

test('campaign stats aggregate events once and preserve placement output shape', () => {
  const events: CampaignStatsEventAggregate[] = [
    { event_type: 'impression', channel: 'web', quantity: 10, placement_id: 'placement-news-primary' },
    { event_type: 'click', channel: 'web', quantity: 2, placement_id: 'placement-news-primary' },
    { event_type: 'email_delivered', channel: 'email', quantity: 20, placement_id: 'placement-email' },
    { event_type: 'email_ad_click', channel: 'email', quantity: 5, placement_id: 'placement-email' },
    { event_type: 'impression', channel: 'web', quantity: 4, placement_id: 'placement-news-secondary' },
    { event_type: 'click', channel: 'web', quantity: 1, placement_id: 'missing-placement' },
    { event_type: 'impression', channel: 'web', quantity: 7, placement_id: null },
  ];

  const draft = aggregateCampaignEvents(events);

  assert.deepEqual(draft.placementIds, [
    'placement-news-primary',
    'placement-email',
    'placement-news-secondary',
    'missing-placement',
  ]);
  assert.deepEqual(buildCampaignStatsResponse(draft, [
    { id: 'placement-news-primary', slug: 'news' },
    { id: 'placement-news-secondary', slug: 'news' },
    { id: 'placement-email', slug: 'newsletter_footer' },
  ]), {
    webImpressions: 21,
    webClicks: 3,
    webCtr: 14.29,
    emailDelivered: 20,
    emailClicks: 5,
    emailCtr: 25,
    byPlacement: {
      news: { impressions: 14, clicks: 2, ctr: 14.29 },
      newsletter_footer: { impressions: 0, clicks: 5, ctr: 0 },
    },
  });
});

test('campaign stats skip placement query inputs when there are no placement ids', () => {
  const draft = aggregateCampaignEvents([
    { event_type: 'impression', channel: 'web', quantity: 3, placement_id: null },
    { event_type: 'click', channel: 'web', quantity: 1, placement_id: null },
  ]);

  assert.deepEqual(draft.placementIds, []);
  assert.deepEqual(buildCampaignStatsResponse(draft, []), {
    webImpressions: 3,
    webClicks: 1,
    webCtr: 33.33,
    emailDelivered: 0,
    emailClicks: 0,
    emailCtr: 0,
    byPlacement: {},
  });
});
