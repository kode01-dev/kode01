ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recommendation_personalization_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.recommendation_personalization_enabled
  IS 'User preference for signed-in behavioral recommendation personalization.';
