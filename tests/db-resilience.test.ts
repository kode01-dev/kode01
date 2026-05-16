import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DB_UNAVAILABLE_CODE,
  createDbUnavailableApiPayload,
  isDbUnavailableApiPayload,
  isTransientDbUnavailableError,
} from '../src/lib/resilience/db-unavailable';
import {
  nextDataSafetyStateOnFailure,
  nextDataSafetyStateOnSuccess,
  type DataSafetyState,
} from '../src/lib/resilience/data-safety';

test('classifies transient db/network errors and payload contract', () => {
  const timeoutError = Object.assign(new Error('connect ETIMEDOUT'), { code: '08006' });
  const abortError = new Error('The operation was aborted');
  Object.assign(abortError, { name: 'AbortError' });
  const nonDbError = Object.assign(new Error('column does not exist'), { code: '42703' });

  assert.equal(isTransientDbUnavailableError(timeoutError), true);
  assert.equal(isTransientDbUnavailableError(abortError), true);
  assert.equal(isTransientDbUnavailableError(nonDbError), false);
  assert.equal(isTransientDbUnavailableError(new Error('validation failed')), false);

  const payload = createDbUnavailableApiPayload();
  assert.equal(payload.code, DB_UNAVAILABLE_CODE);
  assert.equal(isDbUnavailableApiPayload(payload), true);
  assert.equal(
    isDbUnavailableApiPayload({
      ...payload,
      code: 'NOT_DB_UNAVAILABLE',
    }),
    false,
  );
});

test('data safety transitions follow ok -> refresh_required -> degraded -> ok', () => {
  let state: DataSafetyState = 'ok';
  state = nextDataSafetyStateOnFailure(state, 'auto');
  assert.equal(state, 'refresh_required');

  state = nextDataSafetyStateOnFailure(state, 'manual_refresh');
  assert.equal(state, 'degraded');

  state = nextDataSafetyStateOnSuccess();
  assert.equal(state, 'ok');
});
