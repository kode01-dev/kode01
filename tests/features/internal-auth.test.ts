import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInternalAuthHeaders,
  INTERNAL_AUTH_HEADERS,
  verifyInternalAuthHeaders,
} from '@/lib/security/internal-auth';

test('internal auth validates a signed request and blocks replayed nonce', () => {
  const secret = 'super-secret-token-value';
  const now = new Date('2026-03-27T12:00:00.000Z');
  const method = 'POST';
  const path = '/internal/jobs';
  const headers = buildInternalAuthHeaders({
    method,
    path,
    secret,
    now,
  });

  const seen = new Set<string>();
  const verify = () =>
    verifyInternalAuthHeaders({
      method,
      path,
      authorizationHeader: headers.Authorization,
      signatureHeader: headers[INTERNAL_AUTH_HEADERS.signature],
      timestampHeader: headers[INTERNAL_AUTH_HEADERS.timestamp],
      nonceHeader: headers[INTERNAL_AUTH_HEADERS.nonce],
      acceptedSecrets: [secret],
      now,
      replayGuard: (nonce) => {
        if (seen.has(nonce)) return false;
        seen.add(nonce);
        return true;
      },
    });

  const first = verify();
  assert.equal(first.ok, true);

  const replay = verify();
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.reason, 'replayed_nonce');
  }
});

test('internal auth rejects expired timestamps', () => {
  const secret = 'another-super-secret-token';
  const issuedAt = new Date('2026-03-27T12:00:00.000Z');
  const now = new Date('2026-03-27T12:10:30.000Z');
  const method = 'GET';
  const path = '/internal/jobs/abc';
  const headers = buildInternalAuthHeaders({
    method,
    path,
    secret,
    now: issuedAt,
  });

  const verification = verifyInternalAuthHeaders({
    method,
    path,
    authorizationHeader: headers.Authorization,
    signatureHeader: headers[INTERNAL_AUTH_HEADERS.signature],
    timestampHeader: headers[INTERNAL_AUTH_HEADERS.timestamp],
    nonceHeader: headers[INTERNAL_AUTH_HEADERS.nonce],
    acceptedSecrets: [secret],
    now,
    maxSkewSeconds: 300,
  });

  assert.equal(verification.ok, false);
  if (!verification.ok) {
    assert.equal(verification.reason, 'timestamp_expired');
  }
});
