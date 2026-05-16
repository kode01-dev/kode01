import 'server-only';

type DirectDatabaseUrlConfig = {
  url: string | null;
  source: 'SUPABASE_DB_URL_POOLING' | 'DATABASE_URL' | null;
  isPooler: boolean;
  isProductionRuntime: boolean;
  blockedReason: string | null;
};

function isProductionRuntime() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function isSupavisorPoolerUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.includes('pooler.supabase.com') || parsed.port === '6543';
  } catch {
    return false;
  }
}

export function getDirectDatabaseUrlConfig(): DirectDatabaseUrlConfig {
  const poolingUrl = process.env.SUPABASE_DB_URL_POOLING?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const url = poolingUrl || databaseUrl || null;
  const source = poolingUrl ? 'SUPABASE_DB_URL_POOLING' : databaseUrl ? 'DATABASE_URL' : null;
  const productionRuntime = isProductionRuntime();
  const isPooler = url ? isSupavisorPoolerUrl(url) : false;

  return {
    url,
    source,
    isPooler,
    isProductionRuntime: productionRuntime,
    blockedReason: url && productionRuntime && !isPooler
      ? `${source} must use the Supavisor transaction pooler in production runtime.`
      : null,
  };
}
