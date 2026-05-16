import { z } from 'zod';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return false;

  try {
    const parsed = new URL(value, 'https://kode01.internal');
    return parsed.origin === 'https://kode01.internal';
  } catch {
    return false;
  }
}

function isSafeAbsoluteHttpUrl(value: string): boolean {
  if (CONTROL_CHARACTER_PATTERN.test(value)) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

export const ctaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => isSafeInternalPath(value) || isSafeAbsoluteHttpUrl(value), {
    message: 'Must be a safe internal path or an http/https URL',
  });

export const optionalNullableCtaUrlSchema = ctaUrlSchema.optional().nullable();

export const optionalCtaUrlInputSchema = z
  .union([z.literal(''), ctaUrlSchema])
  .optional();
