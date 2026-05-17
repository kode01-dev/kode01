import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { faqItemsToSchema, type FaqItem } from '@/features/faq/faq-model';

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

test('FAQPage schema is generated from the visible FAQ item text only', () => {
  const faqItems: FaqItem[] = [
    {
      question: 'How much does KODE01 cost?',
      answer: 'KODE01 has a free seller plan and a 15% transaction fee on successful sales.',
      links: [{ href: '/pricing', label: 'View pricing' }],
    },
  ];

  const schema = faqItemsToSchema(faqItems);

  assert.equal(schema['@type'], 'FAQPage');
  assert.equal(schema.mainEntity[0].name, faqItems[0].question);
  assert.equal(schema.mainEntity[0].acceptedAnswer.text, faqItems[0].answer);
  assert.doesNotMatch(JSON.stringify(schema), /View pricing/);
});

test('existing FAQ pages keep local visible FAQ items as the authoritative FAQPage source', () => {
  const cliFaqPage = readProjectFile('src/app/[locale]/cli-faq/page.tsx');
  const howItWorksPage = readProjectFile('src/app/[locale]/how-it-works/page.tsx');

  assert.match(cliFaqPage, /const faqItems: FaqItem\[\] = FAQ_KEYS\.map/);
  assert.match(cliFaqPage, /const jsonLd = faqItemsToSchema\(faqItems\);/);
  assert.match(cliFaqPage, /faqItems\.map/);
  assert.match(cliFaqPage, /schemaOverrideMode="prefer-fallback"/);

  assert.match(howItWorksPage, /const faqItems: FaqItem\[\] = FAQ_KEYS\.map/);
  assert.match(howItWorksPage, /const faqSchema = faqItemsToSchema\(faqItems\);/);
  assert.match(howItWorksPage, /<HowItWorksFaq heading=\{t\('faq\.heading'\)\} items=\{faqItems\} \/>/);
  assert.match(howItWorksPage, /schemaOverrideMode="prefer-fallback"/);
});

test('pricing page has a visible contextual FAQ without adding FAQPage JSON-LD', () => {
  const pricingPage = readProjectFile('src/app/[locale]/pricing/page.tsx');

  assert.match(pricingPage, /const PRICING_FAQ_KEYS = \['fees', 'commission', 'advertising', 'sponsoredBlog', 'payments'\] as const;/);
  assert.match(pricingPage, /aria-labelledby="pricing-faq-heading"/);
  assert.match(pricingPage, /<details/);
  assert.match(pricingPage, /<summary/);
  assert.doesNotMatch(pricingPage, /'@type': 'FAQPage'/);
});
