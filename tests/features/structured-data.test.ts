import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StructuredData from '@/components/seo/StructuredData';

test('StructuredData serializes JSON-LD safely for script tags', () => {
  const data = {
    title: '</script><script>alert(1)</script>',
    amp: 'A & B',
    separators: 'line\u2028paragraph\u2029end',
  };

  const markup = renderToStaticMarkup(React.createElement(StructuredData, { data }));

  assert.equal(
    markup.includes('{"title":"</script><script>alert(1)</script>","amp":"A & B"'),
    false,
  );
  assert.equal(markup.includes('\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'), true);
  assert.equal(markup.includes('A \\u0026 B'), true);
  assert.equal(markup.includes('line\\u2028paragraph\\u2029end'), true);
});
