import 'server-only';

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env/server';
import { DependencyRequestError, resilientFetch } from '@/lib/resilience/dependency-client';
import { normalizeSupabaseApiKey } from '@/lib/supabase/api-key';

type InvokeEdgeFunctionOptions = {
  functionName: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: BodyInit;
  requestId?: string;
};

export function getFunctionsBaseUrl() {
  const env = getServerEnv();
  const base = env.SUPABASE_FUNCTIONS_URL ?? `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  return base.replace(/\/+$/, '');
}

export async function invokeEdgeFunction({
  functionName,
  method = 'POST',
  headers,
  body,
  requestId,
}: InvokeEdgeFunctionOptions): Promise<Response> {
  const env = getServerEnv();
  const rawServiceRoleKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleKey = rawServiceRoleKey
    ? normalizeSupabaseApiKey(rawServiceRoleKey)
    : '';
  const cronSecret = env.CRON_SECRET?.trim() ?? '';
  const internalAuthToken =
    env.EDGE_INTERNAL_AUTH_TOKEN?.trim() ?? env.EDGE_INTERNAL_AUTH_TOKEN_NEXT?.trim() ?? '';
  const url = `${getFunctionsBaseUrl()}/${functionName}`;
  const correlationId = requestId ?? randomUUID();
  const outgoingHeaders = new Headers(headers);

  const hasAuthorizationHeader = outgoingHeaders.has('Authorization');
  if (!hasAuthorizationHeader) {
    if (serviceRoleKey) {
      outgoingHeaders.set('Authorization', `Bearer ${serviceRoleKey}`);
    } else if (cronSecret) {
      outgoingHeaders.set('Authorization', `Bearer ${cronSecret}`);
    }
  }

  if (internalAuthToken) {
    outgoingHeaders.set('x-internal-auth', internalAuthToken);
  }

  if (!outgoingHeaders.has('Authorization') && !outgoingHeaders.has('x-internal-auth')) {
    throw new Error(
      'Missing edge invocation credentials. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, EDGE_INTERNAL_AUTH_TOKEN, or provide an Authorization header.',
    );
  }

  outgoingHeaders.set('x-request-id', correlationId);

  try {
    return await resilientFetch(url, {
      method,
      headers: outgoingHeaders,
      body,
      cache: 'no-store',
    }, {
      dependency: `supabase_edge:${functionName}`,
      timeoutMs: 10_000,
      maxAttempts: 3,
      circuitFailureThreshold: 4,
      circuitOpenMs: 20_000,
    });
  } catch (error) {
    if (error instanceof DependencyRequestError) {
      throw new Error(
        `Failed to reach edge function "${functionName}": ${error.code}`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to reach edge function "${functionName}": ${message}`);
  }
}

export async function toNextJsonResponse(response: Response): Promise<NextResponse> {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      return NextResponse.json({ error: 'Invalid JSON response from upstream function' }, { status: 502 });
    }
  }

  const normalizedText = text.trim();

  return NextResponse.json(
    {
      error: response.ok ? normalizedText : normalizedText || 'Unexpected upstream function response',
    },
    { status: response.ok ? 200 : response.status || 502 },
  );
}
