import { NextResponse } from 'next/server';

export type SecurityErrorCode =
  | 'MFA_REQUIRED'
  | 'RATE_LIMITED'
  | 'CSRF_BLOCKED'
  | 'FORBIDDEN_RESOURCE'
  | 'BOT_BLOCKED'
  | 'UNAUTHORIZED';

type SecurityErrorResponseInput = {
  status: number;
  code: SecurityErrorCode;
  message: string;
  requestId?: string | null;
};

export function securityErrorResponse(input: SecurityErrorResponseInput): NextResponse {
  const response = NextResponse.json(
    {
      error: input.code,
      code: input.code,
      message: input.message,
    },
    { status: input.status },
  );

  if (input.requestId && input.requestId.trim().length > 0) {
    response.headers.set('x-request-id', input.requestId.trim());
  }
  response.headers.set('x-security-error', input.code);

  return response;
}

