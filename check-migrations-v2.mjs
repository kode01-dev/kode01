import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Fetching remote migration list...');
  
  // Try common table names for migrations
  const queries = [
    { schema: 'supabase_migrations', table: 'schema_migrations' },
    { schema: 'public', table: 'schema_migrations' },
    { schema: 'realtime', table: 'schema_migrations' }
  ];

  for (const q of queries) {
    try {
      const { data, error } = await supabase
        .from(q.table)
        .select('version')
        .order('version', { ascending: true });

      if (!error && data) {
        console.log(`Found migrations in ${q.schema}.${q.table}:`);
        console.log(JSON.stringify(data.map(m => m.version), null, 2));
        return;
      }
      
      // If error is just "relation does not exist", continue
      if (error && error.code !== 'PGRST116') {
         // console.log(`Error querying ${q.schema}.${q.table}:`, error.message);
      }
    } catch {
      // console.log(`Exception querying ${q.schema}.${q.table}`);
    }
  }

  // Fallback: try raw query if RPC for it exists (unlikely given previous failure but good to try one more generic name)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_migrations');
  if (!rpcError) {
    console.log('Found migrations via RPC get_migrations:');
    console.log(JSON.stringify(rpcData, null, 2));
    return;
  }

  console.error('Could not find migration table in common locations.');
}

run();
