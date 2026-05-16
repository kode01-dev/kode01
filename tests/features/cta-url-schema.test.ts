import assert from 'node:assert/strict';
import test from 'node:test';
import { ctaUrlSchema } from '@/lib/security/cta-url-schema';

test('ctaUrlSchema accepts internal absolute paths', () => {
  assert.equal(ctaUrlSchema.safeParse('/vendor?ref=home#start').success, true);
});

test('ctaUrlSchema accepts absolute http/https URLs', () => {
  assert.equal(ctaUrlSchema.safeParse('https://example.com/path').success, true);
  assert.equal(ctaUrlSchema.safeParse('http://example.com/path').success, true);
});

test('ctaUrlSchema rejects javascript/data and protocol-relative URLs', () => {
  assert.equal(ctaUrlSchema.safeParse('javascript:alert(1)').success, false);
  assert.equal(ctaUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success, false);
  assert.equal(ctaUrlSchema.safeParse('//evil.example/path').success, false);
});

test('ctaUrlSchema rejects ambiguous relative paths and credentials in URL', () => {
  assert.equal(ctaUrlSchema.safeParse('vendor').success, false);
  assert.equal(ctaUrlSchema.safeParse('https://user:pass@example.com').success, false);
});
