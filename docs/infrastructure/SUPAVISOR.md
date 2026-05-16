# Supavisor & Connection Pooling

This document explains how connection pooling is configured for this project to ensure stability in serverless environments (Vercel).

## Overview

Supabase provides **Supavisor**, a high-performance connection pooler. In a serverless environment like Vercel, functions are short-lived and can scale rapidly. Direct connections to PostgreSQL can quickly hit the maximum limit, causing application failures.

## Configuration

### API Access (Standard)
The application primarily uses `@supabase/supabase-js`, which communicates via PostgREST (HTTPS). This does not require a persistent connection and is safe for serverless.

- **URL**: `NEXT_PUBLIC_SUPABASE_URL`
- **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Direct Database Access (Connection Pooling)
For direct SQL execution, server-side scripts, or future ORM usage, use the **Supavisor Pooler URL**.

- **Primary variable**: `SUPABASE_DB_URL_POOLING`
- **Fallback variable**: `DATABASE_URL`
- **Port**: `6543` (Transaction Mode)
- **Format**: `postgresql://postgres.zboonzqhrbuueqqzzrgn:[PASSWORD]@aws-1-ca-central-1.pooler.supabase.com:6543/postgres`

Runtime code that uses direct SQL should prefer `SUPABASE_DB_URL_POOLING` and
fall back to `DATABASE_URL`. This keeps app/runtime access explicit while still
supporting existing scripts and local tooling.

### Why Transaction Mode?
We use port `6543` because it operates in **Transaction Mode**. This allows Supavisor to share a small number of database connections across thousands of concurrent serverless function calls by releasing the connection after each transaction.

## Updating Credentials

If you change your database password, you MUST update the `DATABASE_URL` in Vercel to reflect the new password.

> [!WARNING]
> Do not use port `5432` in production on Vercel. This port is for direct persistent connections and will lead to "Too many connections" errors under load.

## Usage in Next.js

Since `@supabase/supabase-js` uses HTTP, it doesn't use `DATABASE_URL` or
`SUPABASE_DB_URL_POOLING`. To utilize the pooler, use a driver like `postgres.js`
or `pg` only for direct SQL paths.

### Example with `postgres.js`
1. Install: `npm install postgres`
2. Usage:
```typescript
import postgres from 'postgres'

const sql = postgres(process.env.SUPABASE_DB_URL_POOLING || process.env.DATABASE_URL!)

export async function getData() {
  const users = await sql`SELECT * FROM profiles LIMIT 10`
  return users
}
```

## Validation

To verify if your connection is correctly going through the pooler and using Transaction Mode:

1. **Run a Test Query**: Execute a query that checks the current connection count or the backend PID.
2. **Monitor in Supabase Dashboard**:
   - Go to **Database** -> **Database Health**.
   - Check the **Connections** graph. You should see connections staying stable even under high request volume because they are being reused by Supavisor.
3. **CLI Validation**:
   Run `npm run audit:growth` for a fast static readiness check. Run
   `npm run audit:growth:db` only when live database access is expected; it checks
   `pg_stat_statements` and production DB state with a hard timeout.
