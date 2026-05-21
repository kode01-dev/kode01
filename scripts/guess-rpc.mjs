import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = 'SELECT 1';
  const names = [
    { name: 'exec_sql', param: 'sql_query' },
    { name: 'execute_sql', param: 'sql' },
    { name: 'run_sql', param: 'sql' },
    { name: 'exec_sql', param: 'sql' },
    { name: 'execute_sql', param: 'query' }
  ];

  for (const n of names) {
    console.log(`Trying ${n.name} with param ${n.param}...`);
    const { error } = await supabase.rpc(n.name, { [n.param]: sql });
    if (!error) {
      console.log(`SUCCESS! Found ${n.name} with param ${n.param}`);
      process.exit(0);
    } else {
      console.log(`Failed: ${error.message} (code: ${error.code})`);
    }
  }
  console.log('No working SQL RPC found.');
}
run();
