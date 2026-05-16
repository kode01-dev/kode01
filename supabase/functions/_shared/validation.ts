import { z } from 'https://esm.sh/zod@3.23.8';

export { z };

export function parseWithSchema<T>(schema: z.ZodSchema<T>, payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return {
      success: false as const,
      details,
    };
  }

  return {
    success: true as const,
    data: parsed.data,
  };
}

