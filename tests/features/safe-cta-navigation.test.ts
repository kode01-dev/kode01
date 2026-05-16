import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowlistedHostname,
  parseHostnameAllowlist,
  resolveSafeCtaTarget,
} from '@/lib/security/safe-cta-navigation';

test('resolveSafeCtaTarget allows internal absolute paths', () => {
  const target = resolveSafeCtaTarget('/vendor?ref=home#start');
  assert.deepEqual(target, {
    kind: 'internal',
    href: '/vendor?ref=home#start',
  });
});

test('resolveSafeCtaTarget blocks dangerous schemes', () => {
  assert.equal(resolveSafeCtaTarget('javascript:alert(1)'), null);
  assert.equal(resolveSafeCtaTarget('data:text/html,<script>alert(1)</script>'), null);
});

test('resolveSafeCtaTarget blocks protocol-relative and relative-path values', () => {
  assert.equal(resolveSafeCtaTarget('//evil.example/path'), null);
  assert.equal(resolveSafeCtaTarget('vendor'), null);
});

test('resolveSafeCtaTarget blocks all external URLs without allowlist', () => {
  assert.equal(resolveSafeCtaTarget('https://example.com/offer', []), null);
});

test('resolveSafeCtaTarget allows allowlisted external URLs only', () => {
  const target = resolveSafeCtaTarget('https://news.example.com/offer', ['*.example.com']);
  assert.deepEqual(target, {
    kind: 'external',
    href: 'https://news.example.com/offer',
  });
  assert.equal(resolveSafeCtaTarget('https://evil.com/offer', ['*.example.com']), null);
});

test('resolveSafeCtaTarget blocks external URLs with userinfo', () => {
  assert.equal(resolveSafeCtaTarget('https://user:pass@example.com/path', ['example.com']), null);
});

test('resolveSafeCtaTarget treats absolute same-app URLs as internal', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://thiki.example.com';

  const target = resolveSafeCtaTarget('https://thiki.example.com/vendor?utm=1#start', []);
  assert.deepEqual(target, {
    kind: 'internal',
    href: '/vendor?utm=1#start',
  });

  process.env.NEXT_PUBLIC_APP_URL = previous;
});

test('parseHostnameAllowlist normalizes and filters entries', () => {
  assert.deepEqual(parseHostnameAllowlist(' example.com, ,*.trusted.com ,EXAMPLE.ORG '), [
    'example.com',
    '*.trusted.com',
    'example.org',
  ]);
});

test('isAllowlistedHostname supports exact and wildcard rules', () => {
  assert.equal(isAllowlistedHostname('example.com', ['example.com']), true);
  assert.equal(isAllowlistedHostname('api.example.com', ['*.example.com']), true);
  assert.equal(isAllowlistedHostname('badexample.com', ['*.example.com']), false);
});
