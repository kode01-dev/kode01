import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const models = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash',
  'gemini-3.1-pro',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001'
];

async function discover() {
  for (const modelId of models) {
    try {
      console.log(`Testing ${modelId}...`);
      const { text } = await generateText({
        model: google(modelId),
        prompt: 'Hi',
      });
      console.log(`SUCCESS: ${modelId} -> ${text}`);
      return; 
    } catch (e) {
      console.log(`FAILED: ${modelId} -> ${e.message}`);
    }
  }
}
discover();
