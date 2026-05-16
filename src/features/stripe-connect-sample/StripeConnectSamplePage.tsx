'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type ConnectedAccountStatus = {
  accountId: string;
  readyToReceivePayments: boolean;
  onboardingComplete: boolean;
  requirementsStatus: string | null;
  transferCapabilityStatus: string | null;
};

type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  defaultPriceId: string | null;
  priceInCents: number | null;
  currency: string | null;
  connectedAccountId: string | null;
};

type ConnectedAccountSummary = {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
};

type StripeConnectSamplePageProps = {
  locale: string;
};

function formatPrice(priceInCents: number | null, currency: string | null) {
  if (priceInCents === null || !currency) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(priceInCents / 100);
}

export function StripeConnectSamplePage({ locale }: StripeConnectSamplePageProps) {
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [accountStatus, setAccountStatus] = useState<ConnectedAccountStatus | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);

  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPriceInCents, setProductPriceInCents] = useState('2500');
  const [productCurrency, setProductCurrency] = useState('cad');
  const [productLoading, setProductLoading] = useState(false);
  const [productMessage, setProductMessage] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  const [storefrontLoading, setStorefrontLoading] = useState(false);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccountSummary[]>([]);

  const hasConnectedAccount = Boolean(accountStatus?.accountId);

  const groupedProductsCount = useMemo(
    () => products.filter((product) => product.connectedAccountId).length,
    [products],
  );

  const loadAccountStatus = useCallback(async () => {
    try {
      setAccountLoading(true);
      setAccountError(null);

      const response = await fetch('/api/stripe/connect-sample/account', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        error?: string;
        connectedAccount?: ConnectedAccountStatus | null;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to fetch account status');
      }

      setAccountStatus(payload.connectedAccount ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch account status';
      setAccountError(message);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const loadStorefront = useCallback(async () => {
    try {
      setStorefrontLoading(true);
      setStorefrontError(null);

      const response = await fetch('/api/stripe/connect-sample/products', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        error?: string;
        products?: StorefrontProduct[];
        connectedAccounts?: ConnectedAccountSummary[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load storefront data');
      }

      setProducts(payload.products ?? []);
      setConnectedAccounts(payload.connectedAccounts ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load storefront data';
      setStorefrontError(message);
    } finally {
      setStorefrontLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccountStatus();
    void loadStorefront();
  }, [loadAccountStatus, loadStorefront]);

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountMessage(null);
    setAccountError(null);

    try {
      setAccountLoading(true);
      const response = await fetch('/api/stripe/connect-sample/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          contactEmail,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        created?: boolean;
        connectedAccount?: ConnectedAccountStatus | null;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to create connected account');
      }

      setAccountStatus(payload.connectedAccount ?? null);
      setAccountMessage(
        payload.created
          ? 'Connected account created and mapped to your user profile.'
          : 'A connected account already exists for this user.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create connected account';
      setAccountError(message);
    } finally {
      setAccountLoading(false);
    }
  };

  const handleOnboard = async () => {
    setAccountMessage(null);
    setAccountError(null);

    try {
      setAccountLoading(true);
      const response = await fetch('/api/stripe/connect-sample/account-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locale,
        }),
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to create onboarding link');
      }

      window.location.href = payload.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create onboarding link';
      setAccountError(message);
      setAccountLoading(false);
    }
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProductMessage(null);
    setProductError(null);

    try {
      setProductLoading(true);
      const response = await fetch('/api/stripe/connect-sample/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: productName,
          description: productDescription,
          priceInCents: Number(productPriceInCents),
          currency: productCurrency,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        id?: string;
        connectedAccountId?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to create product');
      }

      setProductMessage(
        `Product created (${payload.id ?? 'unknown id'}) and mapped to ${payload.connectedAccountId ?? 'unknown account'}.`,
      );
      setProductName('');
      setProductDescription('');
      await loadStorefront();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create product';
      setProductError(message);
    } finally {
      setProductLoading(false);
    }
  };

  const handleBuy = async (productId: string) => {
    try {
      const response = await fetch('/api/stripe/connect-sample/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          quantity: 1,
          locale,
        }),
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to start checkout');
      }

      window.location.href = payload.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start checkout';
      setStorefrontError(message);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black font-serif text-kode01-noir">Stripe Connect Sample Integration</h1>
      <p className="mt-2 text-sm text-kode01-noir/70">
        End-to-end demo: v2 account creation, onboarding, product creation, storefront, and destination charge checkout.
      </p>

      <section className="mt-8 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-black text-kode01-noir">1) Connect onboarding</h2>
        <p className="mt-1 text-sm text-kode01-noir/70">
          Create the connected account once, then click <strong>Onboard to collect payments</strong>.
        </p>

        <form onSubmit={handleCreateAccount} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-kode01-noir">
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Acme Seller LLC"
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-kode01-noir">
            Contact email
            <input
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="seller@example.com"
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={accountLoading}
              className="rounded-lg bg-kode01-green px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {accountLoading ? 'Working...' : 'Create connected account'}
            </button>

            <button
              type="button"
              onClick={handleOnboard}
              disabled={!hasConnectedAccount || accountLoading}
              className="rounded-lg bg-kode01-pink px-4 py-2 text-sm font-bold text-kode01-noir disabled:opacity-60"
            >
              Onboard to collect payments
            </button>

            <button
              type="button"
              onClick={() => void loadAccountStatus()}
              disabled={accountLoading}
              className="rounded-lg border border-black/20 px-4 py-2 text-sm font-bold text-kode01-noir disabled:opacity-60"
            >
              Refresh onboarding status
            </button>
          </div>
        </form>

        {accountMessage ? <p className="mt-3 text-sm text-kode01-green">{accountMessage}</p> : null}
        {accountError ? <p className="mt-3 text-sm text-red-600">{accountError}</p> : null}

        <div className="mt-4 rounded-xl bg-black/[0.03] p-4 text-sm text-kode01-noir/80">
          <p>
            <strong>Account ID:</strong> {accountStatus?.accountId ?? 'Not connected yet'}
          </p>
          <p>
            <strong>Transfer capability:</strong> {accountStatus?.transferCapabilityStatus ?? 'n/a'}
          </p>
          <p>
            <strong>Requirements summary:</strong> {accountStatus?.requirementsStatus ?? 'n/a'}
          </p>
          <p>
            <strong>Ready to receive payments:</strong>{' '}
            {accountStatus ? (accountStatus.readyToReceivePayments ? 'Yes' : 'No') : 'n/a'}
          </p>
          <p>
            <strong>Onboarding complete:</strong>{' '}
            {accountStatus ? (accountStatus.onboardingComplete ? 'Yes' : 'No') : 'n/a'}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
        <h2 className="text-xl font-black text-kode01-noir">2) Create platform products</h2>
        <p className="mt-1 text-sm text-kode01-noir/70">
          Products are created on the platform account, with mapping stored in metadata.
        </p>

        <form onSubmit={handleCreateProduct} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-kode01-noir">
            Product name
            <input
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Premium Prompt Pack"
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-kode01-noir">
            Currency
            <input
              value={productCurrency}
              onChange={(event) => setProductCurrency(event.target.value)}
              placeholder="cad"
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-kode01-noir sm:col-span-2">
            Description
            <textarea
              value={productDescription}
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="Short summary shown on storefront and checkout."
              rows={3}
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-kode01-noir">
            Price (cents)
            <input
              value={productPriceInCents}
              onChange={(event) => setProductPriceInCents(event.target.value)}
              inputMode="numeric"
              placeholder="2500"
              className="mt-1 w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={productLoading}
              className="h-10 rounded-lg bg-kode01-noir px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {productLoading ? 'Creating...' : 'Create product'}
            </button>
          </div>
        </form>

        {productMessage ? <p className="mt-3 text-sm text-kode01-green">{productMessage}</p> : null}
        {productError ? <p className="mt-3 text-sm text-red-600">{productError}</p> : null}
      </section>

      <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-kode01-noir">3) Storefront</h2>
            <p className="mt-1 text-sm text-kode01-noir/70">
              Displays all products and connected accounts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadStorefront()}
            disabled={storefrontLoading}
            className="rounded-lg border border-black/20 px-4 py-2 text-sm font-bold text-kode01-noir disabled:opacity-60"
          >
            {storefrontLoading ? 'Refreshing...' : 'Refresh storefront'}
          </button>
        </div>

        {storefrontError ? <p className="mt-3 text-sm text-red-600">{storefrontError}</p> : null}

        <div className="mt-4 rounded-xl bg-black/[0.03] p-4 text-sm text-kode01-noir/80">
          <p>
            <strong>Connected accounts:</strong> {connectedAccounts.length}
          </p>
          <p>
            <strong>Products mapped to an account:</strong> {groupedProductsCount}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {connectedAccounts.map((account) => (
            <article key={account.id} className="rounded-xl border border-black/10 p-4">
              <p className="text-sm font-bold text-kode01-noir">{account.displayName ?? 'Unnamed account'}</p>
              <p className="mt-1 text-xs text-kode01-noir/60">{account.contactEmail ?? 'No contact email'}</p>
              <p className="mt-2 text-xs font-mono text-kode01-noir/60">{account.id}</p>
            </article>
          ))}
          {connectedAccounts.length === 0 ? (
            <p className="text-sm text-kode01-noir/60">No connected accounts found yet.</p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {products.map((product) => (
            <article key={product.id} className="rounded-xl border border-black/10 p-4">
              <p className="text-sm font-bold text-kode01-noir">{product.name}</p>
              <p className="mt-1 text-sm text-kode01-noir/70">{product.description ?? 'No description'}</p>
              <p className="mt-2 text-sm font-semibold text-kode01-noir">
                {formatPrice(product.priceInCents, product.currency)}
              </p>
              <p className="mt-1 text-xs text-kode01-noir/60">
                Connected account: {product.connectedAccountId ?? 'Not mapped'}
              </p>

              <button
                type="button"
                onClick={() => void handleBuy(product.id)}
                disabled={!product.connectedAccountId}
                className="mt-3 rounded-lg bg-kode01-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Buy with hosted Checkout
              </button>
            </article>
          ))}
          {products.length === 0 ? (
            <p className="text-sm text-kode01-noir/60">No products found yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
