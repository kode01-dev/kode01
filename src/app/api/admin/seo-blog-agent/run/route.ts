import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import {
  getExecutionMode,
  runAgentOrAccepted,
  shouldWaitForAgentCompletion,
  shouldUseAgentRuntime,
} from '@/lib/agent-runtime/route-control';
import type { EnqueuePayload } from '@/lib/agent-runtime/contracts';

const inputSchema = z.object({
  keyword: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(220),
  locale: z.enum(['en', 'fr']).default('fr'),
  locationName: z.string().trim().max(120).optional().default('Canada'),
  targetLanguage: z.string().trim().max(80).optional(),
  clientDomain: z.string().trim().max(240).optional(),
  aboutPage: z.string().trim().max(1200).optional(),
  authorPage: z.string().trim().max(1200).optional(),
  targetAudience: z.string().trim().max(800).optional(),
  briefSummary: z.string().trim().max(1600).optional(),
  secondaryKeyword: z.string().trim().max(180).optional(),
  tertiaryKeyword: z.string().trim().max(180).optional(),
  category: z.string().trim().max(80).optional(),
  internalLinks: z.array(z.string().trim().max(1200)).max(20).optional().default([]),
  competitorUrls: z.array(z.string().trim().max(1200)).max(8).optional().default([]),
});

const runSchema = z.object({
  profileId: z.string().uuid().optional(),
  input: inputSchema,
  saveToCms: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request, 'admin.seo-blog-agent.run');
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = runSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const executionMode = getExecutionMode();
    if (!shouldUseAgentRuntime(executionMode)) {
      return NextResponse.json(
        {
          error: 'Modal runtime is required for seo-blog-writer. Set AGENT_EXECUTION_MODE=modal, MODAL_AGENT_API_URL, and AGENT_INTERNAL_TOKEN.',
          code: 'MODAL_RUNTIME_REQUIRED',
        },
        { status: 503 },
      );
    }

    const runtimePayload: EnqueuePayload = {
      flow: 'seo-blog-writer',
      mode: 'generate',
      trigger: 'manual',
      profileId: parsed.data.profileId,
      input: parsed.data.input,
      saveToCms: parsed.data.saveToCms,
      userId: adminSession.userId,
      requestId: request.headers.get('x-request-id') ?? undefined,
    };

    return await runAgentOrAccepted(runtimePayload, {
      wait: shouldWaitForAgentCompletion(request),
      waitTimeoutMs: 110_000,
    });
  } catch (error) {
    console.error('POST /api/admin/seo-blog-agent/run error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
