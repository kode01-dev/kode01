import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMarkdownLinkTarget, parseEditorialMarkdown } from '@/features/editorial/lib/markdown';

test('parseEditorialMarkdown builds heading, paragraph, and list blocks', () => {
  const blocks = parseEditorialMarkdown(`# Title

Paragraph body

- Item one
- Item two`);

  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]?.type, 'heading');
  assert.equal(blocks[1]?.type, 'paragraph');
  assert.equal(blocks[2]?.type, 'ul');
});

test('parseEditorialMarkdown supports ordered lists and quotes', () => {
  const blocks = parseEditorialMarkdown(`> Quote line

1. One
2. Two`);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, 'quote');
  assert.equal(blocks[1]?.type, 'ol');
});

test('parseEditorialMarkdown parses markdown tables', () => {
  const blocks = parseEditorialMarkdown(`| Model | Score |
| --- | --- |
| A | 91 |`);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, 'table');
  if (blocks[0]?.type === 'table') {
    assert.deepEqual(blocks[0].headers, ['Model', 'Score']);
    assert.deepEqual(blocks[0].rows[0], ['A', '91']);
  }
});

test('normalizeMarkdownLinkTarget blocks dangerous schemes', () => {
  assert.equal(normalizeMarkdownLinkTarget('javascript:alert(1)'), '#');
  assert.equal(normalizeMarkdownLinkTarget('javascript%3Aalert(1)'), '#');
  assert.equal(normalizeMarkdownLinkTarget(' data:text/html,<script>alert(1)</script> '), '#');
  assert.equal(normalizeMarkdownLinkTarget('//evil.example/path'), '#');
  assert.equal(normalizeMarkdownLinkTarget('ja\tva\nscript:alert(1)'), '#');
});

test('normalizeMarkdownLinkTarget allows safe schemes and normalizes relative links', () => {
  assert.equal(normalizeMarkdownLinkTarget('https://example.com/docs'), 'https://example.com/docs');
  assert.equal(normalizeMarkdownLinkTarget('mailto:security@example.com'), 'mailto:security@example.com');
  assert.equal(normalizeMarkdownLinkTarget('tel:+14165551234'), 'tel:+14165551234');
  assert.equal(normalizeMarkdownLinkTarget('guide/getting-started', '/blog/'), '/blog/guide/getting-started');
  assert.equal(normalizeMarkdownLinkTarget('../release-notes', '/blog/'), '/blog/release-notes');
});
