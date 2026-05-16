import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
  try {
    const migrations = await sql`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC`;
    console.log(JSON.stringify(migrations.map(m => m.version), null, 2));
  } catch (error) {
    console.error('Error fetching migrations:', error);
  } finally {
    await sql.end();
  }
}

run();
