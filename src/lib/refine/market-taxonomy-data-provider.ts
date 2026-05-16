import type {
  BaseRecord,
  CreateParams,
  DataProvider,
  GetListParams,
  GetOneParams,
  HttpError,
  ResourceProps,
  UpdateParams,
} from '@refinedev/core';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

const RESOURCE_ENDPOINTS = {
  'market-categories': '/api/admin/market-categories',
  'market-subcategories': '/api/admin/market-subcategories',
} as const;

export const MARKET_TAXONOMY_RESOURCES: ResourceProps[] = [
  { name: 'market-categories' },
  { name: 'market-subcategories' },
];

type ApiListResponse<TData extends BaseRecord = BaseRecord> = {
  data?: TData[];
  error?: string;
};

type ApiRecordResponse<TData extends BaseRecord = BaseRecord> = {
  data?: TData;
  error?: string;
};

function createHttpError(statusCode: number, message: string): HttpError {
  return { statusCode, message };
}

function getResourceEndpoint(resource: string): string {
  if (resource in RESOURCE_ENDPOINTS) {
    return RESOURCE_ENDPOINTS[resource as keyof typeof RESOURCE_ENDPOINTS];
  }

  throw createHttpError(400, `Unsupported resource "${resource}"`);
}

function coerceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function parseJsonSafe<TResponse>(response: Response): Promise<TResponse | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<TResponse extends { error?: string }>(
  endpoint: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<TResponse> {
  const response = await fetch(endpoint, {
    cache: 'no-store',
    ...init,
  });

  const payload = await parseJsonSafe<TResponse>(response);
  if (!response.ok) {
    throw createHttpError(
      response.status,
      typeof payload?.error === 'string' ? payload.error : fallbackErrorMessage,
    );
  }

  if (!payload) {
    throw createHttpError(500, fallbackErrorMessage);
  }

  return payload;
}

async function fetchResourceList(resource: string): Promise<BaseRecord[]> {
  const endpoint = getResourceEndpoint(resource);
  const payload = await requestJson<ApiListResponse>(
    endpoint,
    { method: 'GET' },
    `Unable to load "${resource}"`,
  );

  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data;
}

export const marketTaxonomyDataProvider: DataProvider = {
  getApiUrl: () => '',
  getList: async <TData extends BaseRecord = BaseRecord>(params: GetListParams) => {
    const data = (await fetchResourceList(params.resource)) as TData[];
    return { data, total: data.length };
  },
  getOne: async <TData extends BaseRecord = BaseRecord>(params: GetOneParams) => {
    const data = (await fetchResourceList(params.resource)) as TData[];
    const record = data.find((item) => String(item.id) === String(params.id));

    if (!record) {
      throw createHttpError(404, `Record "${String(params.id)}" not found`);
    }

    return { data: record };
  },
  create: async <TData extends BaseRecord = BaseRecord>(params: CreateParams<unknown>) => {
    const endpoint = getResourceEndpoint(params.resource);
    const payload = await requestJson<ApiRecordResponse<TData>>(
      endpoint,
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(coerceRecord(params.variables)),
      },
      `Unable to create "${params.resource}"`,
    );

    if (!payload.data) {
      throw createHttpError(500, `Invalid create response for "${params.resource}"`);
    }

    return { data: payload.data };
  },
  update: async <TData extends BaseRecord = BaseRecord>(params: UpdateParams<unknown>) => {
    const endpoint = getResourceEndpoint(params.resource);
    const payload = await requestJson<ApiRecordResponse<TData>>(
      endpoint,
      {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ...coerceRecord(params.variables),
          id: params.id,
        }),
      },
      `Unable to update "${params.resource}"`,
    );

    if (!payload.data) {
      throw createHttpError(500, `Invalid update response for "${params.resource}"`);
    }

    return { data: payload.data };
  },
  deleteOne: async ({ resource }: { resource: string }) => {
    throw createHttpError(405, `Delete is not supported for resource "${resource}"`);
  },
};
