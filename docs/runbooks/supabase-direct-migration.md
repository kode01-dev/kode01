# Supabase Direct Migration Runbook

Target project: `noemwcxtlibtimusldyn`
Source project: `zboonzqhrbuueqqzzrgn`
Date context: 2026-05-16

## Non-Negotiables

- Do not use keys shared in chat or tickets. Regenerate the JWT secret, anon/service role keys, publishable key, secret key, and Supabase access tokens before production.
- Keep the source project intact for 14 days after cutover.
- Do not migrate AI Brain / AI Campus runtime content. The final DB migration drops `modules_directory`, `ai_resources`, `ai_campus_sources`, related sync tables, views, triggers, functions, and cron jobs.
- Do not migrate the `resources-covers` bucket. Migrate only `covers`, `vault`, and `editorial`.
- Because new Supabase projects change Data API exposure defaults on 2026-05-30, apply and verify explicit GRANTs before production.

## Preflight

1. Regenerate Supabase credentials in the target project.
2. Set local shell variables, using secret storage or a private terminal only:
   - `OLD_DB_URL`
   - `NEW_DB_URL`
   - `SUPABASE_ACCESS_TOKEN`
   - `TARGET_PROJECT_REF=noemwcxtlibtimusldyn`
3. Confirm the repo points at the target project:
   - `npm run check:supabase-migration`
   - `npm run scan:secrets`
4. Freeze risky automation during cutover:
   - Vercel crons that replay/sync data.
   - Stripe webhook replay jobs.
   - Modal agent cron execution except retained weekly recap.
   - Any old `directory-sync-cron` or Modal `ai-campus` deployment.

## Rehearsal Restore

Run at least one rehearsal against the target project before production cutover.

```powershell
supabase db dump --db-url "$env:OLD_DB_URL" --role-only --file .\tmp\kode01_roles.sql
supabase db dump --db-url "$env:OLD_DB_URL" --schema-only --file .\tmp\kode01_schema.sql
supabase db dump --db-url "$env:OLD_DB_URL" --data-only --file .\tmp\kode01_data.sql
psql "$env:NEW_DB_URL" -v ON_ERROR_STOP=1 -f .\tmp\kode01_roles.sql
psql "$env:NEW_DB_URL" -v ON_ERROR_STOP=1 -f .\tmp\kode01_schema.sql
psql "$env:NEW_DB_URL" -v ON_ERROR_STOP=1 -f .\tmp\kode01_data.sql
supabase migration up --db-url "$env:NEW_DB_URL"
```

After restore, empty/delete `resources-covers` through the Supabase Storage API or Dashboard. Upload/copy only `covers`, `vault`, and `editorial`.

Deploy only retained Edge Functions:

```powershell
supabase functions deploy send-emails-cron --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-checkout --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-connect --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-customer-portal --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-embedded-checkout --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-subscription-checkout --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy stripe-webhook --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy track-product-view --project-ref "$env:TARGET_PROJECT_REF"
supabase functions deploy weekly-ai-recap-cron --project-ref "$env:TARGET_PROJECT_REF"
```

## Validation Gates

- Auth: signup/login/logout/reset password, then force re-login by revoking old sessions after key rotation.
- Marketplace: product list/search/detail, vendor dashboard, upload to `covers` and `vault`.
- Payments: Stripe checkout, Connect, customer portal, webhook write path, signed download.
- Admin: users, orders, coupons, ads, CMS/editorial, notifications.
- Retained AI recap: weekly recap only, if still enabled.
- Removed AI Brain/Campus: no app route, no admin nav, no DB object, no `directory-sync-cron`, no Modal `ai-campus`.
- Data API: no `42501 permission denied` from public pages, authenticated dashboards, Edge Functions, or webhooks.

Run:

```powershell
npm run check:supabase-migration
npm run scan:secrets
npm run typecheck
npm run test
npm run build
```

## Cutover Direct

1. Make the final data dump as late as possible.
2. Replay the delta into the target project if writes happened after the rehearsal restore.
3. Update Vercel, Modal, Stripe, and local production secrets:
   - `NEXT_PUBLIC_SUPABASE_URL=https://noemwcxtlibtimusldyn.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_FUNCTIONS_URL=https://noemwcxtlibtimusldyn.supabase.co/functions/v1`
   - `DATABASE_URL` / `SUPABASE_DB_URL_POOLING`
   - Stripe webhook endpoints/secrets if endpoint URLs change.
4. Redeploy production.
5. Run smoke tests immediately.

## Rollback

Rollback remains env-only while the old Supabase project is preserved:

1. Restore the previous Vercel/Modal/Stripe Supabase variables.
2. Redeploy production.
3. If writes reached the target project before rollback, export the deltas and decide manual replay into the source project.

Do not destructively modify the source project during the 14-day stabilization period.
