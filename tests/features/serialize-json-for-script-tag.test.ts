import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';

test('serializeJsonForScriptTag escapes script-breaking characters', () => {
  const input = {
    title: '</script><script>alert(1)</script>',
    amp: 'A & B',
    separators: 'line\u2028paragraph\u2029end',
  };

  const serialized = serializeJsonForScriptTag(input);

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('<script>'), false);
  assert.equal(serialized.includes('&'), false);
  assert.equal(serialized.includes('\u2028'), false);
  assert.equal(serialized.includes('\u2029'), false);

  assert.equal(serialized.includes('\\u003c/script\\u003e'), true);
  assert.equal(serialized.includes('\\u003cscript\\u003e'), true);
  assert.equal(serialized.includes('\\u0026'), true);
  assert.equal(serialized.includes('\\u2028'), true);
  assert.equal(serialized.includes('\\u2029'), true);
});
