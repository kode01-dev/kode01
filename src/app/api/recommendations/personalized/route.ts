import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRecommendedPaidProducts } from '@/features/recommendations/server/recommendations';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const bodySchema = z.object({
  context: z.object({
    type: z.literal('product'),
    currentProductId: z.string().min(1),
    title: z.string().min(1),
    category: z.string().nullish(),
    tags: z.array(z.string()).optional(),
  }),
  limit: z.coerce.number().int().min(1).max(8).optional().default(4),
});

export async function POST(request: Request) {
  try {
    const payload = bodySchema.parse(await request.json());
    const items = await getRecommendedPaidProducts({
      context: payload.context,
      limit: payload.limit,
      personalize: true,
    });

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    console.error('Recommendations personalized POST error:', error);
    if (isTransientDbUnavailableError(error)) {
      return NextResponse.json(
        createDbUnavailableApiPayload(),
        { status: DB_UNAVAILABLE_STATUS, headers: DB_UNAVAILABLE_RESPONSE_HEADERS },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
