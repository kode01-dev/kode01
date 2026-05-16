# KODE01

KODE01 is an enterprise-grade AI marketplace platform for digital brainpower.
It helps builders, creators, and technical teams discover, buy, sell, and operate
high-value digital infrastructure: AI agent blueprints, workflow automations,
Notion systems, templates, AI tools, and vetted creator products.

The platform is built for more than storefront commerce. KODE01 combines a
curated marketplace, seller operations, secure payments, editorial discovery,
automation pipelines, and admin controls into a single production system.

Built with **Next.js 16**, **React 19**, **Tailwind CSS 4**, **Supabase**,
**Stripe Connect**, and **Supabase Edge Functions**.

## Product Overview

KODE01 gives AI builders a trusted place to turn knowledge into reusable digital
assets, and gives buyers a faster path to production-ready systems without
starting from zero.

Core audiences:

- **Creators and vendors**: publish digital products, AI workflows, templates,
  systems, bundles, and agent blueprints.
- **Builders and operators**: discover vetted assets, agent blueprints,
  workflow systems, and implementation-ready tools.
- **Platform administrators**: manage catalog quality, editorial content,
  privacy operations, moderation, incidents, ads, coupons, and operational
  health.

## Core Platform Capabilities

### Marketplace Commerce

- Digital product catalog with categories, subcategories, tags, bundles, reviews,
  recommendations, saved items, and creator profiles.
- Stripe-powered checkout, subscriptions, Connect seller onboarding, customer
  portal support, and connected-account samples.
- Vendor dashboards for product publishing, order incidents, analytics, coupons,
  affiliates, bundles, and seller setup.

### Agent Blueprints

- GitHub-style publishing flow for reusable AI agent architectures.
- Blueprint metadata for prompts, tool configuration, compatible models,
  deployment targets, installation guidance, and license type.
- Admin vetting flow for quality control before marketplace exposure.

### Editorial, News, and Growth Systems

- AI News and weekly recap pipeline with source scraping, structured generation,
  fact-checking, newsletter support, and persisted generation artifacts.
- Editorial CMS, sponsored submissions, SEO overrides, dynamic OG metadata, and
  sitemap generation.
- Ads, marketing campaigns, homepage layout controls, recommendation events, and
  privacy-aware personalization.

### Trust, Safety, and Operations

- Vendor badges, content moderation, product reporting, order incident handling,
  SLA tracking, webhook replay, and admin audit flows.
- Cookie consent, GDPR/CCPA surfaces, Canadian privacy policy coverage, account
  export/delete flows, and local storage minimization work.
- API monitoring, bot activity tracking, cron health checks, notification
  controllers, and operational runbooks.

## Enterprise Architecture

KODE01 is organized as a production Next.js application backed by Supabase,
Stripe, Vercel-compatible deployment patterns, and selected edge/runtime workers.

Key architecture areas:

- **Web application**: Next.js App Router, React 19, locale-aware routes, server
  components, client dashboards, and Tailwind CSS 4 styling.
- **Database and auth**: Supabase Postgres, RLS policies, SQL migrations, server
  helpers, and profile/role hardening.
- **Payments**: Stripe Checkout, Stripe Connect, subscriptions, customer portal,
  product/account mapping, webhook handling, and thin event support.
- **Edge functions**: sensitive payment, cron, email, and view handlers moved to
  Supabase Edge Functions where appropriate.
- **Automation**: centralized cron dispatcher, Supabase `pg_cron`, license
  webhook processing, abandoned cart flows, notifications, newsletter sends, and
  operational maintenance jobs.
- **AI runtime**: Modal-compatible agent runtime for the weekly recap pipeline,
  with HMAC-authenticated internal calls, dead-letter replay, and scheduler
  ownership controls.
- **SEO and discovery**: dynamic SEO overrides, structured data, localized
  metadata, OG image routes, and `next-sitemap`.

## Security and Compliance Posture

This repository reflects security-hardening and compliance-readiness work rather
than a certification claim.

Implemented or documented controls include:

- Global HTTP security headers in `next.config.ts`.
- HMAC-based internal authentication for protected cron and runtime flows.
- Supabase RLS hardening, admin MFA enforcement, restricted shop names, and
  profile role normalization.
- Stripe webhook validation, connected-account onboarding safeguards, country
  change controls, and replay tooling.
- CSRF tests, API key scoping tests, egress policy coverage, rate limiter
  fallback tests, and secret scanning.
- Privacy and data-rights surfaces for cookies, GDPR/CCPA, Canadian privacy
  requirements, export, deletion, and tracking data controls.
- SOC 2 readiness evidence and security runbooks under `docs/security` and
  `docs/runbooks`.

Useful references:

- `docs/security/soc2-readiness-evidence-pack.md`
- `docs/security/security-baseline-2026-04-13.md`
- `docs/security/vulnerability-management.md`
- `docs/runbooks/critical-dependency-outage.md`
- `docs/runbooks/internal-secret-rotation.md`
- `docs/runbooks/dead-letter-replay.md`
- `docs/runbooks/runtime-rollback.md`

## Technology Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Radix UI, lucide-react,
  next-intl, Recharts.
- **Backend**: Next.js API routes, Supabase Edge Functions, Supabase Postgres,
  Supabase Auth, Supabase Storage.
- **Payments**: Stripe, Stripe Connect, Checkout, subscriptions, customer portal,
  webhooks, thin events.
- **AI and automation**: Vercel AI SDK, Anthropic SDK, Google AI SDK, Scrapling,
  Modal runtime, scheduled pipelines.
- **Email and notifications**: Resend, Brevo, SendFox, web push, in-app
  notification controllers.
- **Quality**: TypeScript, ESLint, Playwright, custom Node test runner, secret
  scanning, performance benches, migration checks.

## Local Development

Development naming and module conventions are documented in
`docs/development/naming-and-structure.md`.

### Requirements

- Node.js `22.x`
- pnpm `10.33.4`
- Supabase project credentials for database-backed flows
- Stripe credentials for payment and Connect flows

### Setup

```bash
pnpm install
```

Create a local environment file from the template:

```bash
cp .env.example .env.local
```

On Windows, copy `.env.example` to `.env.local` manually if `cp` is unavailable.

Start the development server:

```bash
pnpm dev
```

## Quality Checks

Run the main checks before shipping code changes:

```bash
pnpm run scan:secrets
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run check:sharp
pnpm run check:migrations
pnpm run build
```

The combined critical path is available as:

```bash
pnpm run ci:critical
```

Additional checks:

```bash
pnpm run test:smoke
pnpm audit --prod --audit-level=moderate
pnpm run images:backfill:dry-run
pnpm run perf:gate
```

## Operations and Deployment Notes

### Supabase

SQL migrations live under `supabase/migrations`. Edge function source lives under
`supabase/functions`.

Sensitive payment, cron, email, and tracking flows include Supabase Edge Function
implementations such as:

- `stripe-webhook`
- `stripe-checkout`
- `stripe-embedded-checkout`
- `stripe-subscription-checkout`
- `stripe-customer-portal`
- `send-emails-cron`
- `track-product-view`

Example deploy command:

```bash
supabase functions deploy stripe-webhook
```

### Weekly AI Recap

The AI recap pipeline supports public news pages, admin run controls, source
scraping, structured article generation, fact-checking, newsletter delivery, and
artifact reuse for paid AI calls.

Important routes and services:

- Public pages: `/news`, `/news/[slug]`
- Cron endpoint: `/api/cron/weekly-ai-recap`
- Admin controls: `/api/admin/weekly-ai-recap/*`
- Modal runtime: `services/modal-agent-runtime/runtime.py`

### Modal Agent Runtime

The Modal runtime supports protected internal execution for AI recap work.

Runtime hardening includes:

- Bearer token and HMAC signature validation
- Timestamp and nonce headers
- Internal SLO endpoint
- Dead-letter replay endpoint
- Scheduler ownership controls
- Kill switches for protected cron flows

See the operational runbooks in `docs/runbooks` before changing ownership,
rollback, or replay behavior.

## Repository Structure

```text
src/app                 Next.js routes, API routes, layouts, and pages
src/features            Product domains: marketplace, admin, vendor, editorial
src/components          Shared UI and SEO components
src/lib                 Shared server, SEO, security, Supabase, and utility code
supabase/migrations     Database migrations
supabase/functions      Supabase Edge Functions
services                Modal agent runtime and service code
tests                   API, feature, smoke, and regression tests
docs                    Security, operations, performance, and integration docs
scripts                 Maintenance, seed, audit, migration, and verification scripts
```

## Product Principle

KODE01 exists to reduce the distance between expertise and execution. The
platform treats AI workflows, agent architectures, automations, and digital
systems as serious business assets: discoverable, sellable, auditable, and ready
to operate.
