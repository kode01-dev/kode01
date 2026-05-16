/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement de production
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Erreur : URL ou Clé Supabase manquante dans .env.production");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNews() {
  console.log("Recherche des 3 derniers articles dans 'ai_recap_posts'...");
  const { data, error } = await supabase
    .from('ai_recap_posts')
    .select('id, title, created_at, edition_id')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error("Erreur lors de la lecture des posts :", error);
  } else {
    console.log("Derniers posts trouvés :");
    console.log(JSON.stringify(data, null, 2));
  }

  console.log("\nRecherche des 3 derniers runs dans 'ai_recap_runs'...");
  const { data: runs, error: runsError } = await supabase
    .from('ai_recap_runs')
    .select('id, mode, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  if (runsError) {
    console.error("Erreur lors de la lecture des runs :", runsError);
  } else {
    console.log("Derniers runs trouvés :");
    console.log(JSON.stringify(runs, null, 2));
  }
}

checkNews();
