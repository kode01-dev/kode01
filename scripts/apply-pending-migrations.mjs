import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

const PENDING_MIGRATIONS = [
  '20260619000000_harden_profiles_self_update_policy.sql'
];

async function applyMigration(filename) {
  const filePath = path.join('supabase', 'migrations', filename);
  const migrationSql = fs.readFileSync(filePath, 'utf8');
  console.log(`Applying ${filename}...`);

  try {
    await sql.begin(async (tx) => {
      // Execute the migration SQL
      // Note: We need to handle multi-statement SQL. 
      // postgres.js can execute multiple statements if they are passed as one string.
      await tx.unsafe(migrationSql);
      
      // Mark migration as applied in the tracking table
      // We extract the version from the filename (first part before underscore)
      const version = filename.split('_')[0];
      await tx`INSERT INTO supabase_migrations.schema_migrations (version) VALUES (${version})`;
    });
    console.log(`Successfully applied ${filename}`);
    return true;
  } catch (error) {
    if (error.message.includes('already exists') || error.code === '23505') {
      console.log(`Skipped ${filename} (already exists or version recorded)`);
      return true;
    }
    console.error(`Error applying ${filename}:`, error.message);
    return false;
  }
}

async function run() {
  try {
    for (const migration of PENDING_MIGRATIONS) {
      const success = await applyMigration(migration);
      if (!success) {
        console.error(`Stopping at ${migration} due to errors.`);
        process.exit(1);
      }
    }
    console.log('All pending migrations applied successfully.');
  } finally {
    await sql.end();
  }
}

run();
