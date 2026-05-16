import { invokeEdgeFunction } from '@/lib/edge/invoke';

export async function runSendEmailsTask(runId: string, authorization: string) {
  const upstream = await invokeEdgeFunction({
    functionName: 'send-emails-cron',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    requestId: runId,
    body: JSON.stringify({ source: 'next-api-adapter' }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => 'Unknown upstream error');
    throw new Error(`Upstream edge function failed (${upstream.status}): ${errorText}`);
  }

  return {
    upstreamStatus: upstream.status,
    upstreamOk: upstream.ok,
  };
}
