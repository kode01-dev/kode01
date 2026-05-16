import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/api/admin/weekly-ai-recap/run';
const TEST_LIST_ID = process.env.SENDFOX_TEST_LIST_ID?.trim() || undefined;
const CRON_SECRET = process.env.CRON_SECRET?.trim() || undefined;
const EDITION_KEY = process.env.RECAP_TEST_EDITION_KEY?.trim() || undefined;

async function triggerTestSend() {
  if (!CRON_SECRET) {
    console.error('Missing required environment variable: CRON_SECRET');
    process.exitCode = 1;
    return;
  }
  if (!TEST_LIST_ID) {
    console.error('Missing required environment variable: SENDFOX_TEST_LIST_ID');
    process.exitCode = 1;
    return;
  }

  console.log(
    `Triggering test newsletter send to SendFox list ${TEST_LIST_ID}${EDITION_KEY ? ` for edition ${EDITION_KEY}` : ''}...`,
  );

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({
        mode: 'send_newsletter',
        trigger: 'manual',
        force: true,
        editionKey: EDITION_KEY,
        testMode: true,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Success:', JSON.stringify(data, null, 2));
    } else {
      console.error('Error:', response.status, JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Failed to trigger test send:', error);
  }
}

triggerTestSend();
