export default async function StripeConnectSampleSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <h1 className="text-2xl font-black font-serif text-kode01-noir">Payment successful</h1>
        <p className="mt-2 text-sm text-kode01-noir/70">
          Hosted Checkout completed successfully for this Connect sample flow.
        </p>
        <p className="mt-4 rounded-lg bg-black/[0.03] p-3 text-xs font-mono text-kode01-noir/70">
          Session ID: {sessionId ?? 'Not provided'}
        </p>
      </div>
    </main>
  );
}
