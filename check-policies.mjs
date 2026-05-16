import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

async function run() {
  try {
    const policies = await sql`
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'profiles' AND schemaname = 'public'
    `;
    console.log(JSON.stringify(policies, null, 2));
  } catch (error) {
    console.error('Error fetching policies:', error);
  } finally {
    await sql.end();
  }
}

run();
