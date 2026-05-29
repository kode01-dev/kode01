import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mirrorAgentJob } from '@/lib/agent-runtime/client';
import {
  getExecutionMode,
  runAgentOrAccepted,
  shouldUseAgentRuntime,
  shouldWaitForAgentCompletion,
} from '@/lib/agent-runtime/route-control';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';
import { getAiRecapRunBlock } from '@/lib/ai-recap/run-guard';

async function getAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return isAdminRole(profile?.role) ? { supabase, userId: user.id } : null;
}

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient();
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.newsletter_retry.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { supabase, userId } = adminClient;
    const payload = await req.json().catch(() => ({}));
    const editionKey = typeof payload?.editionKey === 'string' ? payload.editionKey : undefined;
    const testEmail = typeof payload?.testEmail === 'string' ? payload.testEmail : undefined;
    const testMode = typeof payload?.testMode === 'boolean' ? payload.testMode : undefined;
    const runBlock = await getAiRecapRunBlock(supabase);
    if (runBlock) {
      await logAuditEvent({
        eventType: 'ai_recap.newsletter_retry.blocked.disabled',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          edition_key: editionKey ?? null,
          test_mode: testMode ?? null,
          reason: runBlock.reason,
        },
      });
      return NextResponse.json(
        {
          error: runBlock.message,
          code: runBlock.code,
          reason: runBlock.reason,
          skipped: true,
        },
        { status: 409 },
      );
    }

    const executionMode = getExecutionMode();
    const runtimePayload = {
      flow: 'weekly-ai-recap' as const,
      mode: 'retry_newsletter' as const,
      trigger: 'retry' as const,
      editionKey,
      testEmail,
      testMode,
      requestId: req.headers.get('x-request-id') ?? undefined,
    };

    if (shouldUseAgentRuntime(executionMode)) {
      const agentResponse = await runAgentOrAccepted(runtimePayload, {
        wait: shouldWaitForAgentCompletion(req),
      });
      await logAuditEvent({
        eventType: agentResponse.ok
          ? 'ai_recap.newsletter_retry.triggered'
          : 'ai_recap.newsletter_retry.failed.upstream',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          edition_key: editionKey ?? null,
          test_mode: testMode ?? null,
          execution_mode: executionMode,
          upstream_status: agentResponse.status,
        },
      });
      return agentResponse;
    }

    if (executionMode !== 'vercel') {
      void mirrorAgentJob(runtimePayload);
    }

    const upstream = await invokeEdgeFunction({
      functionName: 'weekly-ai-recap-cron',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      requestId: req.headers.get('x-request-id') ?? undefined,
      body: JSON.stringify({
        mode: 'retry_newsletter',
        trigger: 'retry',
        editionKey,
        testEmail,
        testMode,
      }),
    });

    await logAuditEvent({
      eventType: upstream.ok
        ? 'ai_recap.newsletter_retry.triggered'
        : 'ai_recap.newsletter_retry.failed.upstream',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        edition_key: editionKey ?? null,
        test_mode: testMode ?? null,
        execution_mode: executionMode,
        upstream_status: upstream.status,
      },
    });

    return await toNextJsonResponse(upstream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Retry AI recap newsletter route error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.newsletter_retry.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: message },
    });
    return NextResponse.json({ error: message || 'Internal Server Error' }, { status: 500 });
  }
}

