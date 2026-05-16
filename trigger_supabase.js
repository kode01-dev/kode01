// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

// Charger l'env de prod
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL || `${supabaseUrl}/functions/v1`;

async function triggerTest() {
  console.log(`Tentative de déclenchement sur : ${functionsUrl}/weekly-ai-recap-cron`);
  
  try {
    const cronSecret = process.env.CRON_SECRET;
    const internalToken = process.env.EDGE_INTERNAL_AUTH_TOKEN;

    console.log(`Tentative avec CRON_SECRET...`);
    
    const response = await fetch(`${functionsUrl.trim()}/weekly-ai-recap-cron`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret.trim()}`,
        'x-internal-auth': internalToken.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mode: 'tick', trigger: 'manual' })
    });

    console.log(`Statut: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log(`Réponse: ${text}`);
  } catch (err) {
    console.error(`Erreur réseau: ${err.message}`);
  }
}

triggerTest();
