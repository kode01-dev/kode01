import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip';

test('prefers trusted platform IP header over spoofable forwarded header', () => {
  const headers = new Headers({
    'x-forwarded-for': '203.0.113.20',
    'x-vercel-forwarded-for': '198.51.100.10',
  });

  const ip = getTrustedClientIpFromHeaders(headers);
  assert.equal(ip, '198.51.100.10');
});

test('falls back to first valid x-forwarded-for address when trusted headers are missing', () => {
  const headers = new Headers({
    'x-forwarded-for': 'invalid-ip, 192.0.2.15',
  });

  const ip = getTrustedClientIpFromHeaders(headers);
  assert.equal(ip, '192.0.2.15');
});

test('returns null when no valid IP headers are present', () => {
  const headers = new Headers({
    'x-forwarded-for': 'unknown',
    'x-real-ip': 'not-an-ip',
  });

  const ip = getTrustedClientIpFromHeaders(headers);
  assert.equal(ip, null);
});

test('ignores spoofable forwarded headers in production', () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = 'production';

  try {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.77',
      'x-client-ip': '198.51.100.88',
    });

    const ip = getTrustedClientIpFromHeaders(headers);
    assert.equal(ip, null);
  } finally {
    if (previous === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previous;
    }
  }
});
