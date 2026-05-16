import fs from 'node:fs/promises';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const DATE_PATTERN = /^(\d{8})/;

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

async function main() {
  const maxDate = process.env.MIGRATION_DATE_MAX ?? todayStamp();
  const enforce = process.env.MIGRATION_DATE_ENFORCE === '1'
    || process.env.MIGRATION_DATE_ENFORCE === 'true';
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const futureMigrations = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      const match = name.match(DATE_PATTERN);
      return match ? match[1] > maxDate : false;
    })
    .sort();

  if (futureMigrations.length === 0) {
    console.log(`Migration date check passed. max=${maxDate}`);
    return;
  }

  console.warn(`Found ${futureMigrations.length} migration(s) dated after ${maxDate}:`);
  for (const name of futureMigrations) {
    console.warn(`- ${name}`);
  }

  if (enforce) {
    process.exitCode = 1;
    return;
  }

  console.warn('Warning only. Set MIGRATION_DATE_ENFORCE=true to fail on future-dated migrations.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
