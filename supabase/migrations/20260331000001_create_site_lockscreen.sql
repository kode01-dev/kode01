-- Site Lockscreen Configuration Table
-- Stores settings for the site-wide lockscreen feature

CREATE TABLE IF NOT EXISTS public.site_lockscreen_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT NOT NULL,

  -- Bilingual content
  title_en TEXT NOT NULL DEFAULT 'Coming Soon',
  title_fr TEXT NOT NULL DEFAULT 'Bientôt disponible',
  message_en TEXT NOT NULL DEFAULT 'We are launching soon. Enter the password to access the site.',
  message_fr TEXT NOT NULL DEFAULT 'Nous lançons bientôt. Entrez le mot de passe pour accéder au site.',

  -- Newsletter integration
  newsletter_enabled BOOLEAN NOT NULL DEFAULT true,
  newsletter_title_en TEXT NOT NULL DEFAULT 'Don''t miss the launch',
  newsletter_title_fr TEXT NOT NULL DEFAULT 'Ne manquez pas le lancement',
  newsletter_cta_en TEXT NOT NULL DEFAULT 'Subscribe',
  newsletter_cta_fr TEXT NOT NULL DEFAULT 'S''abonner',

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.site_lockscreen_config ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Public can read config (for displaying lockscreen)
-- Note: password_hash should be excluded in SELECT queries
CREATE POLICY "Public can read lockscreen config"
  ON public.site_lockscreen_config
  FOR SELECT
  USING (true);

-- RLS Policy: Only admins can insert config
CREATE POLICY "Admins can insert lockscreen config"
  ON public.site_lockscreen_config
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Only admins can update config
CREATE POLICY "Admins can update lockscreen config"
  ON public.site_lockscreen_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Only admins can delete config
CREATE POLICY "Admins can delete lockscreen config"
  ON public.site_lockscreen_config
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at
DROP TRIGGER IF EXISTS site_lockscreen_config_updated_at_trigger ON public.site_lockscreen_config;
CREATE TRIGGER site_lockscreen_config_updated_at_trigger
  BEFORE UPDATE ON public.site_lockscreen_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed initial configuration (disabled by default)
-- Default password: "launch2026" (bcrypt hash with 12 rounds)
-- Hash generated with: bcrypt.hash('launch2026', 12)
INSERT INTO public.site_lockscreen_config (
  id,
  is_enabled,
  password_hash,
  title_en,
  title_fr,
  message_en,
  message_fr,
  newsletter_enabled,
  newsletter_title_en,
  newsletter_title_fr,
  newsletter_cta_en,
  newsletter_cta_fr
) VALUES (
  gen_random_uuid(),
  false, -- Disabled by default
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5ux6h8kxzAzqm', -- 'launch2026'
  'Coming Soon',
  'Bientôt disponible',
  'We are launching soon. Enter the password to access the site or subscribe to our newsletter.',
  'Nous lançons bientôt. Entrez le mot de passe pour accéder au site ou inscrivez-vous à notre infolettre.',
  true,
  'Don''t miss the launch!',
  'Ne manquez pas le lancement!',
  'Subscribe',
  'S''abonner'
) ON CONFLICT (id) DO NOTHING;

-- Create index for quick enabled status lookup
CREATE INDEX IF NOT EXISTS idx_site_lockscreen_enabled
  ON public.site_lockscreen_config(is_enabled);

-- Add comment to table
COMMENT ON TABLE public.site_lockscreen_config IS
  'Configuration for site-wide lockscreen feature. Single row table for global settings.';
