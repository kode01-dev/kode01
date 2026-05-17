export type FaqLink = {
  href: string;
  label: string;
};

export type FaqItem = {
  question: string;
  answer: string;
  links?: readonly FaqLink[];
};

export function faqItemsToSchema(faqItems: readonly Pick<FaqItem, 'question' | 'answer'>[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
