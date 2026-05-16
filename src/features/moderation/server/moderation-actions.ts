'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const reportSchema = z.object({
  product_id: z.string().uuid(),
  reason: z.enum(['illegal', 'violence', 'copyright', 'spam', 'other']),
  details: z.string().max(1000).optional(),
});

export async function submitProductReport(formData: z.infer<typeof reportSchema>) {
  const supabase = await createClient();
  
  const validated = reportSchema.safeParse(formData);
  if (!validated.success) {
    return { error: 'Données invalides' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from as any)('content_moderation_reports')
    .insert([{
      product_id: validated.data.product_id,
      reason: validated.data.reason,
      details: validated.data.details,
      status: 'pending'
    }]);

  if (error) {
    console.error('Error submitting report:', error);
    return { error: 'Erreur lors de l\'envoi du signalement' };
  }

  revalidatePath('/[locale]/products/[product_slug]', 'page');
  return { success: true };
}
