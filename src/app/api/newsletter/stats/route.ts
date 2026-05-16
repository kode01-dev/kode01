import { NextResponse } from 'next/server';
import { normalizeEnvValue } from '@/lib/env/normalize';

type SendFoxConfig = {
  apiToken: string;
  baseUrl: string;
  listId: number;
};

const COUNT_KEYS = [
  'subscribers_count',
  'subscriber_count',
  'contacts_count',
  'contact_count',
  'members_count',
  'total_subscribers',
  'total_contacts',
  'total',
  'count',
];

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=43200',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? 'https://api.sendfox.com').replace(/\/+$/, '');
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return null;
}

function getConfig(): SendFoxConfig | null {
  const apiToken = normalizeEnvValue(process.env.SENDFOX_API_TOKEN);
  const listIdRaw = normalizeEnvValue(process.env.SENDFOX_LIST_ID);

  if (!apiToken || !listIdRaw) {
    return null;
  }

  const listId = Number(listIdRaw);
  if (!Number.isInteger(listId) || listId <= 0) {
    return null;
  }

  return {
    apiToken,
    baseUrl: normalizeBaseUrl(normalizeEnvValue(process.env.SENDFOX_API_BASE_URL)),
    listId,
  };
}

function extractCount(payload: unknown): number | null {
  if (!isRecord(payload)) {
    return null;
  }

  for (const key of COUNT_KEYS) {
    const count = parseCount(payload[key]);
    if (count !== null) {
      return count;
    }
  }

  const nestedCandidates: unknown[] = [
    payload.data,
    payload.meta,
    payload.pagination,
    isRecord(payload.meta) ? payload.meta.pagination : null,
    isRecord(payload.data) ? payload.data.meta : null,
  ];

  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate)) continue;

    for (const key of COUNT_KEYS) {
      const count = parseCount(candidate[key]);
      if (count !== null) {
        return count;
      }
    }
  }

  if (Array.isArray(payload.data)) {
    return payload.data.length;
  }

  return null;
}

async function sendFoxGet(
  config: SendFoxConfig,
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  const performRequest = async (withQueryToken: boolean) => {
    const url = new URL(`${config.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value.length > 0) {
          url.searchParams.set(key, value);
        }
      }
    }

    if (withQueryToken) {
      url.searchParams.set('api_key', config.apiToken);
    }

    return fetch(url.toString(), {
      method: 'GET',
      headers: withQueryToken ? {} : { Authorization: `Bearer ${config.apiToken}` },
      cache: 'no-store',
    });
  };

  let response = await performRequest(false);
  if (response.status === 401 || response.status === 403) {
    response = await performRequest(true);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`SendFox API error ${response.status}: ${rawBody}`);
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

export async function GET() {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ subscribers: 0 }, { headers: PUBLIC_CACHE_HEADERS });
  }

  try {
    const listPayload = await sendFoxGet(config, `/lists/${config.listId}`);
    let subscribers = extractCount(listPayload);

    if (subscribers === null) {
      const contactsPayload = await sendFoxGet(config, `/lists/${config.listId}/contacts`, { limit: '1' });
      subscribers = extractCount(contactsPayload);
    }

    return NextResponse.json({ subscribers: subscribers ?? 0 }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('Failed to fetch newsletter subscriber count:', error);
    return NextResponse.json({ subscribers: 0 }, { headers: PUBLIC_CACHE_HEADERS });
  }
}
