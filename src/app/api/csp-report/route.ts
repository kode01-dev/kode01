import { NextResponse } from 'next/server';
import { z } from 'zod';

const cspReportEnvelopeSchema = z
  .object({
    'csp-report': z.record(z.string(), z.unknown()).optional(),
    csp_report: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function toSafeString(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function getReportField(
  report: Record<string, unknown>,
  snakeCaseKey: string,
  kebabCaseKey: string,
): string | null {
  return toSafeString(report[snakeCaseKey] ?? report[kebabCaseKey]);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null);
    const parsed = cspReportEnvelopeSchema.safeParse(payload);
    if (parsed.success) {
      const report =
        parsed.data['csp-report'] ??
        parsed.data.csp_report ??
        parsed.data;

      const normalizedReport = {
        document_uri: getReportField(report, 'document_uri', 'document-uri'),
        violated_directive: getReportField(report, 'violated_directive', 'violated-directive'),
        effective_directive: getReportField(report, 'effective_directive', 'effective-directive'),
        blocked_uri: getReportField(report, 'blocked_uri', 'blocked-uri'),
        source_file: getReportField(report, 'source_file', 'source-file'),
      };

      const hasUsefulData = Object.values(normalizedReport).some((value) => value !== null);
      if (hasUsefulData) {
        console.info('CSP report received', normalizedReport);
      }
    }
  } catch {
    // Ignore malformed reports from user agents.
  }

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
