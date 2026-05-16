import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

export function getSafeConnectionTargetLabel() {
  return '[redacted]';
}

async function testConnection() {
  const connectionString = process.env.SUPABASE_DB_URL_POOLING || process.env.DATABASE_URL;
  const source = process.env.SUPABASE_DB_URL_POOLING ? 'SUPABASE_DB_URL_POOLING' : 'DATABASE_URL';

  if (!connectionString) {
    console.error('Error: SUPABASE_DB_URL_POOLING or DATABASE_URL is not defined in .env.local');
    process.exit(1);
  }

  console.log('--- Database Connection Test (Supavisor) ---');
  console.log(`Source: ${source}`);
  console.log(`Target: ${getSafeConnectionTargetLabel()}`);

  try {
    const postgres = (await import('postgres')).default;
    const sql = postgres(connectionString, { max: 1, idle_timeout: 5 });

    console.log('Connecting...');
    const result = await sql`SELECT version(), now(), current_setting('max_connections') as max_conn`;

    console.log('Success! Connection established.');
    console.log(`Database Version: ${result[0].version}`);
    console.log(`Current DB Time: ${result[0].now}`);
    console.log(`Max Connections (DB): ${result[0].max_conn}`);

    await sql.end();
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('Error: the "postgres" package is not installed.');
      console.log('To run this test, please run: npm install postgres');
    } else {
      console.error('Database connection failed:', err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  testConnection();
}
