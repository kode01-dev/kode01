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
        eventType: 'ai_recap.run.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { supabase, userId } = adminClient;
    const authMode = 'admin';
    console.info('Manual AI recap run auth:', { authMode, userId });

    const payload = await req.json().catch(() => ({}));
    const force = Boolean(payload?.force);
    const editionKey = typeof payload?.editionKey === 'string' ? payload.editionKey : undefined;
    const testEmail = typeof payload?.testEmail === 'string' ? payload.testEmail : undefined;
    const mode =
      payload?.mode === 'build_article' || payload?.mode === 'send_newsletter' || payload?.mode === 'tick'
        ? payload.mode
        : 'build_article';
    const explicitTestMode = typeof payload?.testMode === 'boolean' ? payload.testMode : undefined;
    // Manual send_newsletter runs are test sends by default unless explicitly overridden.
    const testMode = mode === 'send_newsletter' ? (explicitTestMode ?? true) : Boolean(explicitTestMode);
    const runBlock = await getAiRecapRunBlock(supabase);
    if (runBlock) {
      await logAuditEvent({
        eventType: 'ai_recap.run.blocked.disabled',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          auth_mode: authMode,
          mode,
          force,
          edition_key: editionKey ?? null,
          test_mode: testMode,
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
      mode,
      trigger: 'manual' as const,
      force,
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
        eventType: agentResponse.ok ? 'ai_recap.run.triggered' : 'ai_recap.run.failed.upstream',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          auth_mode: authMode,
          mode,
          force,
          edition_key: editionKey ?? null,
          test_mode: testMode,
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
        mode,
        trigger: 'manual',
        force,
        editionKey,
        testEmail,
        testMode,
      }),
    });

    await logAuditEvent({
      eventType: upstream.ok ? 'ai_recap.run.triggered' : 'ai_recap.run.failed.upstream',
      userId: userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        auth_mode: authMode,
        mode,
        force,
        edition_key: editionKey ?? null,
        test_mode: testMode,
        upstream_status: upstream.status,
        execution_mode: executionMode,
      },
    });

    return await toNextJsonResponse(upstream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Manual AI recap run route error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.run.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: message },
    });
    return NextResponse.json({ error: message || 'Internal Server Error' }, { status: 500 });
  }
}

