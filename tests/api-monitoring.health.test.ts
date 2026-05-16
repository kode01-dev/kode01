import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyEndpointHealth,
  shouldSendRedAlert,
} from '../src/features/api-monitoring/server/health';

test('classifyEndpointHealth returns green/yellow/red using configured thresholds', () => {
  assert.equal(
    classifyEndpointHealth({
      errorRatePercent: 1.99,
      attemptsLast30m: 0,
      successesLast30m: 0,
    }),
    'green',
  );

  assert.equal(
    classifyEndpointHealth({
      errorRatePercent: 2,
      attemptsLast30m: 0,
      successesLast30m: 0,
    }),
    'yellow',
  );

  assert.equal(
    classifyEndpointHealth({
      errorRatePercent: 5.01,
      attemptsLast30m: 0,
      successesLast30m: 0,
    }),
    'red',
  );
});

test('classifyEndpointHealth returns red when there are recent attempts without success', () => {
  assert.equal(
    classifyEndpointHealth({
      errorRatePercent: 0,
      attemptsLast30m: 10,
      successesLast30m: 0,
    }),
    'red',
  );
});

test('shouldSendRedAlert deduplicates repeated red states', () => {
  assert.equal(shouldSendRedAlert(null, 'red'), true);
  assert.equal(shouldSendRedAlert('green', 'red'), true);
  assert.equal(shouldSendRedAlert('yellow', 'red'), true);
  assert.equal(shouldSendRedAlert('red', 'red'), false);
  assert.equal(shouldSendRedAlert('red', 'yellow'), false);
  assert.equal(shouldSendRedAlert('red', 'green'), false);
});
