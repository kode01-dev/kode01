import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const liveDbAudit = process.argv.includes('--live') || process.env.GROWTH_AUDIT_LIVE === 'true';
const hardTimeoutMs = Number(process.env.GROWTH_AUDIT_TIMEOUT_MS || 15_000);

function resolveDatabaseUrl() {
  const poolingUrl = process.env.SUPABASE_DB_URL_POOLING?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const url = poolingUrl || databaseUrl || null;
  const source = poolingUrl ? 'SUPABASE_DB_URL_POOLING' : databaseUrl ? 'DATABASE_URL' : null;
  return { url, source };
}

function isPoolerUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.includes('pooler.supabase.com') || parsed.port === '6543';
  } catch {
    return false;
  }
}

function statusLine(status, label, detail) {
  const prefix = status === 'ok' ? 'OK' : status === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${prefix}] ${label}${detail ? ` - ${detail}` : ''}`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function fileContains(relativePath, pattern) {
  try {
    return pattern.test(readText(relativePath));
  } catch {
    return false;
  }
}

function runStaticAudit() {
  const database = resolveDatabaseUrl();
  if (!database.url) {
    statusLine('warn', 'Database URL', 'SUPABASE_DB_URL_POOLING or DATABASE_URL not configured locally');
  } else {
    statusLine(
      isPoolerUrl(database.url) ? 'ok' : 'warn',
      'Direct Postgres pooling',
      `${database.source} ${isPoolerUrl(database.url) ? 'uses Supavisor/6543' : 'does not look like Supavisor transaction mode'}`,
    );
  }

  statusLine(
    fileContains('supabase/migrations/20260624000000_rls_admin_perf_v4.sql', /is_admin_user\(\)/) ? 'ok' : 'fail',
    'RLS admin helper migration',
    '20260624000000_rls_admin_perf_v4.sql',
  );

  statusLine(
    fileContains('supabase/migrations/20260306000001_add_stripe_webhook_events.sql', /stripe_webhook_events/) ? 'ok' : 'fail',
    'Stripe webhook idempotence migration',
    '20260306000001_add_stripe_webhook_events.sql',
  );

  statusLine(
    fileContains('supabase/functions/stripe-webhook/index.ts', /acquireWebhookEventLock/) ? 'ok' : 'fail',
    'Stripe webhook lock implementation',
    'acquireWebhookEventLock present',
  );

  statusLine(
    fileContains('src/lib/resilience/dependency-client.ts', /export async function resilientFetch/) ? 'ok' : 'fail',
    'Resilience helper',
    'resilientFetch present',
  );

  statusLine(
    fileContains('supabase/migrations/20261005000000_create_abandoned_cart_email_jobs.sql', /abandoned_cart_email_jobs/) ? 'ok' : 'fail',
    'Abandoned cart email queue migration',
    '20261005000000_create_abandoned_cart_email_jobs.sql',
  );

  const abandonedRouteSendsEmail = fileContains('src/app/api/cron/abandoned-carts/route.ts', /resend\.emails\.send/);
  statusLine(
    abandonedRouteSendsEmail ? 'warn' : 'ok',
    'Abandoned carts cron',
    abandonedRouteSendsEmail
      ? 'synchronous Resend send path still present; queue/worker refactor remains'
      : 'scanner enqueues jobs; email delivery is handled by abandoned-cart-emails',
  );

  console.log('\nStatic audit completed. Run `npm run audit:growth:db` only when live DB access is expected.');
}

async function audit() {
  if (!liveDbAudit) {
    runStaticAudit();
    return;
  }

  const hardTimeout = setTimeout(() => {
    statusLine('fail', 'Growth audit timed out', `${hardTimeoutMs}ms elapsed while waiting for live DB`);
    process.exit(124);
  }, hardTimeoutMs);

  const database = resolveDatabaseUrl();
  if (!database.url) {
    statusLine('fail', 'Database URL', 'set SUPABASE_DB_URL_POOLING or DATABASE_URL');
    process.exitCode = 1;
    clearTimeout(hardTimeout);
    return;
  }

  statusLine(
    isPoolerUrl(database.url) ? 'ok' : 'warn',
    'Direct Postgres pooling',
    `${database.source} ${isPoolerUrl(database.url) ? 'uses Supavisor/6543' : 'does not look like Supavisor transaction mode'}`,
  );

  const sql = postgres(database.url, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 10,
    fetch_types: false,
  });
  try {
    const [adminFunctionRows, adminPolicyRows, helperPolicyRows, pgStatRows, webhookRows, slowQueryRows] = await Promise.all([
      sql`
        SELECT p.provolatile, p.prosecdef
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_admin_user'
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
            COALESCE(qual, '') ILIKE '%profiles%'
            OR COALESCE(with_check, '') ILIKE '%profiles%'
          )
          AND (
            COALESCE(qual, '') ILIKE '%role%admin%'
            OR COALESCE(with_check, '') ILIKE '%role%admin%'
          )
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
            COALESCE(qual, '') ILIKE '%is_admin_user%'
            OR COALESCE(with_check, '') ILIKE '%is_admin_user%'
          )
      `,
      sql`
        SELECT extversion
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
      `,
      sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'stripe_webhook_events'
        ) AS exists
      `,
      sql`
        SELECT
          calls,
          ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
          ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
          LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 180) AS sample_query
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND query ~* '^(select|with|update|insert|delete)'
          AND query NOT ILIKE '%pg_catalog%'
          AND query NOT ILIKE '%information_schema%'
        ORDER BY total_exec_time DESC
        LIMIT 5
      `.catch((error) => ({ error })),
    ]);

    const adminFunction = adminFunctionRows[0];
    statusLine(
      adminFunction?.provolatile === 's' && adminFunction?.prosecdef === true ? 'ok' : 'fail',
      'RLS admin helper',
      adminFunction
        ? `volatility=${adminFunction.provolatile}, security_definer=${adminFunction.prosecdef}`
        : 'public.is_admin_user() missing',
    );

    const directAdminPolicyCount = Number(adminPolicyRows[0]?.count ?? 0);
    statusLine(
      directAdminPolicyCount === 0 ? 'ok' : 'warn',
      'Direct admin role policies',
      `${directAdminPolicyCount} policies still reference profiles role admin directly`,
    );

    const helperPolicyCount = Number(helperPolicyRows[0]?.count ?? 0);
    statusLine(
      helperPolicyCount > 0 ? 'ok' : 'warn',
      'Policies using is_admin_user',
      `${helperPolicyCount} policies use the helper`,
    );

    statusLine(
      pgStatRows.length > 0 ? 'ok' : 'fail',
      'pg_stat_statements',
      pgStatRows[0]?.extversion ? `extension version ${pgStatRows[0].extversion}` : 'extension missing',
    );

    statusLine(
      webhookRows[0]?.exists === true ? 'ok' : 'fail',
      'Stripe webhook idempotence table',
      webhookRows[0]?.exists === true ? 'public.stripe_webhook_events exists' : 'table missing',
    );

    if ('error' in slowQueryRows) {
      statusLine('warn', 'Top slow queries', slowQueryRows.error.message);
    } else {
      console.log('\nTop pg_stat_statements queries by total_exec_time:');
      for (const row of slowQueryRows) {
        console.log(`- calls=${row.calls} mean=${row.mean_exec_time_ms}ms total=${row.total_exec_time_ms}ms :: ${row.sample_query}`);
      }
    }

    if (!isPoolerUrl(database.url) || !adminFunction || pgStatRows.length === 0 || webhookRows[0]?.exists !== true) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
    clearTimeout(hardTimeout);
  }
}

audit().catch((error) => {
  statusLine('fail', 'Growth audit failed', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
