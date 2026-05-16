import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function listModels() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_GENERATIVE_AI_API_KEY missing');
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('API Error:', JSON.stringify(data.error, null, 2));
    } else {
      console.log('Available Models:');
      data.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
    }
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

listModels();
