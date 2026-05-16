import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function validateEnv(envPath, label) {
  console.log(`\n--- Validating ${label} Environment (${envPath}) ---`);
  if (!fs.stat(path.resolve(__dirname, '..', envPath)).catch(() => false)) {
    console.warn(`⚠️  ${envPath} not found. Skipping.`);
    return null;
  }

  const envContent = await fs.readFile(path.resolve(__dirname, '..', envPath), 'utf8');
  const config = dotenv.parse(envContent);

  const mandatoryKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'RESEND_API_KEY'
  ];

  let missing = 0;
  for (const key of mandatoryKeys) {
    if (!config[key]) {
      console.error(`❌ Missing mandatory key: ${key}`);
      missing++;
    } else {
      console.log(`✅ Found ${key}`);
    }
  }

  if (!config.NEXT_PUBLIC_SUPABASE_ANON_KEY && !config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    console.error('Missing mandatory Supabase public key: NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    missing++;
  } else {
    console.log('Found Supabase public key');
  }

  if (missing === 0) {
    console.log(`✨ ${label} environment structure is valid.`);
  } else {
    console.error(`🛑 ${label} environment has ${missing} missing mandatory keys.`);
  }

  return config;
}

async function validateI18n() {
  console.log('\n--- Validating i18n JSON integrity ---');
  const locales = ['en', 'fr'];
  for (const locale of locales) {
    const filePath = path.resolve(__dirname, `../messages/${locale}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      JSON.parse(content);
      console.log(`✅ ${locale}.json is valid JSON.`);
    } catch (err) {
      console.error(`❌ ${locale}.json is INVALID: ${err.message}`);
    }
  }
}

async function testDb(config, label) {
  if (!config || !config.DATABASE_URL) return;
  console.log(`\n--- Testing ${label} Database Connectivity ---`);
  try {
    const postgres = (await import('postgres')).default;
    const sql = postgres(config.DATABASE_URL, { connect_timeout: 10 });
    const result = await sql`SELECT count(*) FROM public.profiles`;
    console.log(`✅ Successfully connected! Profiles count: ${result[0].count}`);
    await sql.end();
  } catch (err) {
    console.error(`❌ ${label} Database connection failed: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Starting COMPREHENSIVE CORE SMOKE TEST (Non-AI)');

  const localConfig = await validateEnv('.env.local', 'LOCAL');
  const prodConfig = await validateEnv('.env.production', 'PRODUCTION');

  await validateI18n();

  if (localConfig) await testDb(localConfig, 'LOCAL');
  if (prodConfig) await testDb(prodConfig, 'PRODUCTION');

  console.log('\n🏁 Smoke test script execution finished.');
}

main().catch(err => {
  console.error('💥 Fatal error in smoke test script:', err);
  process.exit(1);
});
