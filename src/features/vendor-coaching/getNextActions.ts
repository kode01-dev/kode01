export interface NextAction {
  id: string;
  type: 'setup' | 'optimize' | 'grow';
  title: string;
  description: string;
  href: string;
  priority: number; // 1=highest
}

export function getNextActions(params: {
  stripeReady: boolean;
  hasProducts: boolean;
  profileComplete: boolean;
  productCount: number;
  totalSales: number;
  totalViews: number;
  locale: string;
}): NextAction[] {
  const {
    stripeReady,
    hasProducts,
    profileComplete,
    productCount,
    totalSales,
    totalViews,
    locale,
  } = params;

  const actions: NextAction[] = [];

  if (!stripeReady) {
    actions.push({
      id: 'connect-stripe',
      type: 'setup',
      title: 'Connect Stripe to start selling',
      description:
        'Link your Stripe account so you can accept payments and start earning from your products.',
      href: '/vendor',
      priority: 1,
    });
  }

  if (!hasProducts) {
    actions.push({
      id: 'add-first-product',
      type: 'setup',
      title: 'Add your first product',
      description:
        'Create and publish your first digital product to make it available on the marketplace.',
      href: `/${locale}/vendor/products/new`,
      priority: 2,
    });
  }

  if (!profileComplete) {
    actions.push({
      id: 'complete-profile',
      type: 'setup',
      title: 'Complete your profile to build trust',
      description:
        'A complete profile with a photo and bio helps buyers feel confident purchasing from you.',
      href: `/${locale}/vendor/settings`,
      priority: 3,
    });
  }

  if (productCount > 0 && totalSales === 0) {
    actions.push({
      id: 'share-products',
      type: 'grow',
      title: 'Share your products to get your first sale',
      description:
        'Spread the word on social media or with your audience to land your first customer.',
      href: `/${locale}/vendor/products`,
      priority: 4,
    });
  }

  if (totalViews > 100 && totalSales === 0) {
    actions.push({
      id: 'adjust-prices',
      type: 'optimize',
      title: 'Your products get views but no sales — try adjusting prices',
      description:
        'You have traffic but no conversions yet. Experiment with pricing or update your product descriptions.',
      href: `/${locale}/vendor/products`,
      priority: 5,
    });
  }

  if (productCount < 3) {
    actions.push({
      id: 'add-more-products',
      type: 'grow',
      title: 'Add more products — creators with 3+ products earn 4x more',
      description:
        'Expanding your catalog gives buyers more reasons to choose you and increases your earning potential.',
      href: `/${locale}/vendor/products/new`,
      priority: 6,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
