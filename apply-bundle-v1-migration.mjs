import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not defined in .env.local');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

const MIGRATION_FILE = '20260518000000_bundle_v1_enforcement.sql';

async function applyMigration(filename) {
  const filePath = path.join('supabase', 'migrations', filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    return false;
  }
  const migrationSql = fs.readFileSync(filePath, 'utf8');
  console.log(`Applying ${filename} to production...`);

  try {
    // We use unsafe for raw SQL with multiple statements
    await sql.unsafe(migrationSql);
    console.log(`Successfully applied ${filename}`);
    return true;
  } catch (error) {
    console.error(`Error applying ${filename}:`, error.message);
    return false;
  }
}

async function run() {
  try {
    const success = await applyMigration(MIGRATION_FILE);
    if (!success) {
      process.exit(1);
    }
    console.log('Migration completed.');
  } finally {
    await sql.end();
  }
}

run();
