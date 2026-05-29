## 2024-04-04 - [Concurrent DB Updates in Loops]
**Learning:** Sequential `await supabase.from(...).update(...)` calls inside loops cause N+1-like latency bottlenecks.
**Action:** Always map loop elements to returning Promises and execute them concurrently via `Promise.all()` to dramatically reduce request latency. Ensure `Promise.resolve()` is returned when skipping an element inside the map to maintain promise array integrity.

## 2024-05-24 - N+1 External API Call Optimization
**Learning:** Stripe API calls for listing objects can cause an N+1 external API call bottleneck if related objects (like prices for products) aren't expanded during the initial list call.
**Action:** Use `expand: ['data.default_price']` in Stripe API `.list` calls to retrieve related objects in a single call, preventing N+1 queries.

## 2024-05-24 - N+1 Webhook Dispatching in Cron Jobs
**Learning:** Sequential `dispatchDelivery` calls inside cron jobs (like `src/app/api/cron/license-webhooks/route.ts`) that execute `fetch()` and `supabase.update()` sequentially cause severe latency bottlenecks.
**Action:** Parallelize independent webhook dispatching across chunks using `Promise.all` inside the cron loop. Use a batch chunk size (e.g. 10) to limit concurrency instead of mapping an unbounded array, protecting database connection pools and external APIs while eliminating sequential N+1 network latency.

## 2026-05-29 - Public Bundle Link Hydration
**Learning:** Public bundle list hydration can become CPU-bound when each bundle scans the full `product_bundle_items` link array to find its own products.
**Action:** Build a `bundle_id -> product_id[]` map once before mapping bundles so hydration stays O(bundles + links), preserving product order without repeated filters.
