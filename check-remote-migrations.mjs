import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { 
    sql: 'SELECT version FROM supabase_migrations.schema_migrations' 
  });
  
  if (error) {
    console.error('Error fetching migrations:', error);
    // If supabase_migrations doesn't exist, try public.schema_migrations
    const { data: d2, error: e2 } = await supabase.rpc('execute_sql', { 
      sql: 'SELECT version FROM public.schema_migrations' 
    });
    if (e2) {
       console.error('Failed to fetch migrations from both locations');
    } else {
       console.log(JSON.stringify(d2, null, 2));
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
