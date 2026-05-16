import { createHmac } from 'crypto';

const MAX_STORED_RESPONSE_BODY_LENGTH = 2000;
const BASE_RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 60 * 60;

export function buildLicenseWebhookSignature(payloadText: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(payloadText).digest('hex');
  return `sha256=${digest}`;
}

export function computeLicenseWebhookRetryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  const delay = BASE_RETRY_DELAY_SECONDS * (2 ** exponent);
  return Math.min(delay, MAX_RETRY_DELAY_SECONDS);
}

export function truncateWebhookResponseBody(input: string | null | undefined): string | null {
  if (!input) return null;
  if (input.length <= MAX_STORED_RESPONSE_BODY_LENGTH) return input;
  return input.slice(0, MAX_STORED_RESPONSE_BODY_LENGTH);
}
