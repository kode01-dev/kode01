type SupabaseLike = {
  from: (table: 'profiles') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { recommendation_personalization_enabled?: boolean | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

export async function shouldTrackSignedInRecommendations(
  supabase: unknown,
  userId: string,
): Promise<boolean> {
  const client = supabase as SupabaseLike;
  const { data, error } = await client
    .from('profiles')
    .select('recommendation_personalization_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to read recommendation personalization preference:', error);
    return false;
  }

  return data?.recommendation_personalization_enabled === true;
}
