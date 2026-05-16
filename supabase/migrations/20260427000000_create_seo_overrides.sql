-- SEO Overrides: allows admins to override page titles and descriptions from the admin panel
-- These take priority over the default translation-based metadata

CREATE TABLE IF NOT EXISTS seo_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  route_path TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  title TEXT,
  description TEXT,
  og_title TEXT,
  og_description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(route_path, locale)
);

ALTER TABLE seo_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_overrides_public_read"
  ON seo_overrides FOR SELECT
  USING (true);

CREATE POLICY "seo_overrides_admin_insert"
  ON seo_overrides FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "seo_overrides_admin_update"
  ON seo_overrides FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "seo_overrides_admin_delete"
  ON seo_overrides FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
