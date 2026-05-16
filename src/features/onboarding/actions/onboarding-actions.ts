'use server';

import { createClient } from '@/lib/supabase/server';

export async function markOnboardingCompleted(): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false };

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', user.id);

  return { success: !error };
}
