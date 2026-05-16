import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeEnvValue } from '@/lib/env/normalize';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip';

const subscribeSchema = z.object({
  email: z.string().trim().email(),
});

type SendFoxConfig = {
  apiToken: string;
  baseUrl: string;
};

type SendFoxContact = {
  id: number;
  email?: string;
};

type SendFoxListContactsPayload = {
  data?: unknown;
};

class NewsletterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewsletterConfigError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractSendFoxError(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  const errors = payload.errors;
  if (!isRecord(errors)) {
    return null;
  }

  const firstError = Object.values(errors)[0];
  if (Array.isArray(firstError)) {
    const firstMessage = firstError.find((value) => typeof value === 'string');
    return typeof firstMessage === 'string' ? firstMessage : null;
  }

  return typeof firstError === 'string' ? firstError : null;
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? 'https://api.sendfox.com').replace(/\/+$/, '');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getNewsletterConfig(): { config: SendFoxConfig; listId: number } {
  const apiToken = normalizeEnvValue(process.env.SENDFOX_API_TOKEN);
  const listIdRaw = normalizeEnvValue(process.env.SENDFOX_LIST_ID);
  const baseUrl = normalizeBaseUrl(normalizeEnvValue(process.env.SENDFOX_API_BASE_URL));

  if (!apiToken || !listIdRaw) {
    throw new NewsletterConfigError('Missing SENDFOX_API_TOKEN or SENDFOX_LIST_ID.');
  }

  const listId = Number(listIdRaw);
  if (!Number.isInteger(listId) || listId <= 0) {
    throw new NewsletterConfigError('Invalid SENDFOX_LIST_ID value. Expected a positive integer.');
  }

  return {
    config: { apiToken, baseUrl },
    listId,
  };
}

function getRequesterIp(request: Request): string | undefined {
  return getTrustedClientIpFromHeaders(request.headers) ?? undefined;
}

async function sendFoxRequest(
  config: SendFoxConfig,
  path: string,
  options?: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  },
): Promise<unknown> {
  const method = options?.method ?? 'POST';
  const query = options?.query ?? {};

  const performRequest = async (withQueryToken: boolean) => {
    const url = new URL(`${config.baseUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value.length > 0) {
        url.searchParams.set(key, value);
      }
    });
    if (withQueryToken) {
      url.searchParams.set('api_key', config.apiToken);
    }

    return fetch(url.toString(), {
      method,
      headers: {
        ...(withQueryToken ? {} : { Authorization: `Bearer ${config.apiToken}` }),
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(options?.body ?? {}) : undefined,
    });
  };

  let response = await performRequest(false);
  if (response.status === 401 || response.status === 403) {
    response = await performRequest(true);
  }

  const raw = await response.text();
  const payload = parseJsonSafe(raw);
  if (!response.ok) {
    const details = extractSendFoxError(payload) ?? raw ?? 'Unknown SendFox error';
    throw new Error(`SendFox API error ${response.status}: ${details}`);
  }

  return payload;
}

function parseContactId(payload: unknown): number | null {
  if (!isRecord(payload)) {
    return null;
  }
  return typeof payload.id === 'number' ? payload.id : null;
}

function parseContact(payload: unknown): SendFoxContact | null {
  if (!isRecord(payload) || typeof payload.id !== 'number') {
    return null;
  }

  const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : undefined;
  return { id: payload.id, email };
}

function isExistingContactError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const isConflictStatus =
    message.includes('sendfox api error 400') ||
    message.includes('sendfox api error 409') ||
    message.includes('sendfox api error 422');
  const hasConflictHint =
    message.includes('already') ||
    message.includes('taken') ||
    message.includes('exists') ||
    message.includes('duplicate');

  return isConflictStatus && hasConflictHint;
}

async function getContactByEmail(config: SendFoxConfig, email: string): Promise<SendFoxContact | null> {
  const payload = await sendFoxRequest(config, '/contacts', {
    method: 'GET',
    query: { email },
  });

  if (!isRecord(payload)) {
    return null;
  }

  const records = (payload as SendFoxListContactsPayload).data;
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  const parsedContacts = records
    .map((entry) => parseContact(entry))
    .filter((entry): entry is SendFoxContact => entry !== null);
  if (parsedContacts.length === 0) {
    return null;
  }

  const normalizedTargetEmail = normalizeEmail(email);
  const exactMatch = parsedContacts.find((contact) => contact.email === normalizedTargetEmail);
  if (exactMatch) {
    return exactMatch;
  }

  const fallbackWithoutEmail = parsedContacts.find((contact) => contact.email === undefined);
  if (fallbackWithoutEmail) {
    return fallbackWithoutEmail;
  }

  return null;
}

async function createContact(
  config: SendFoxConfig,
  email: string,
  ipAddress?: string,
  listId?: number,
): Promise<number> {
  const body: Record<string, unknown> = { email };
  if (ipAddress) {
    body.ip_address = ipAddress;
  }
  if (typeof listId === 'number') {
    body.lists = [listId];
  }

  const payload = await sendFoxRequest(config, '/contacts', {
    method: 'POST',
    body,
  });

  const contactId = parseContactId(payload);
  if (!contactId) {
    throw new Error('SendFox contact creation returned an invalid response.');
  }

  return contactId;
}

async function addContactToList(config: SendFoxConfig, listId: number, contactId: number) {
  await sendFoxRequest(config, `/lists/${listId}/contacts`, {
    method: 'POST',
    body: {
      contact_id: contactId,
    },
  });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const rateLimited = await enforceRouteRateLimit({
      request,
      action: 'SIGNUP',
      extraKeyPart: parsed.data.email,
    });
    if (rateLimited) {
      return rateLimited;
    }

    const { config, listId } = getNewsletterConfig();
    const email = normalizeEmail(parsed.data.email);
    const existingContact = await getContactByEmail(config, email);
    const contactId =
      existingContact?.id ??
      (await createContact(config, email, getRequesterIp(request), listId).catch(async (error) => {
        if (!isExistingContactError(error)) {
          throw error;
        }

        const contactAfterConflict = await getContactByEmail(config, email);
        if (!contactAfterConflict) {
          throw error;
        }

        return contactAfterConflict.id;
      }));

    await addContactToList(config, listId, contactId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NewsletterConfigError) {
      console.error('Newsletter configuration error:', error.message);
      return NextResponse.json({ error: 'Newsletter configuration error' }, { status: 500 });
    }

    console.error('Newsletter subscription error:', error);
    return NextResponse.json({ error: 'Unable to subscribe at the moment' }, { status: 500 });
  }
}
