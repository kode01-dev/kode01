SET search_path = '';

CREATE TABLE IF NOT EXISTS public.footer_social_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT NOT NULL, -- Lucide icon name
  order_index INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.footer_social_links ENABLE ROW LEVEL SECURITY;

-- Select policy: public can read enabled links
DROP POLICY IF EXISTS "Public can read enabled social links" ON public.footer_social_links;
CREATE POLICY "Public can read enabled social links"
  ON public.footer_social_links
  FOR SELECT
  USING (is_enabled = true OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Admin policies: full access
DROP POLICY IF EXISTS "Admins can manage social links" ON public.footer_social_links;
CREATE POLICY "Admins can manage social links"
  ON public.footer_social_links
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS footer_social_links_updated_at ON public.footer_social_links;
CREATE TRIGGER footer_social_links_updated_at
  BEFORE UPDATE ON public.footer_social_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data
INSERT INTO public.footer_social_links (platform, label_en, label_fr, url, icon, order_index)
VALUES
  ('Twitter', 'X (Twitter)', 'X (Twitter)', 'https://twitter.com/kode01', 'Twitter', 0),
  ('Github', 'GitHub', 'GitHub', 'https://github.com/kode01', 'Github', 1),
  ('Linkedin', 'LinkedIn', 'LinkedIn', 'https://linkedin.com/company/kode01', 'Linkedin', 2),
  ('Discord', 'Discord', 'Discord', 'https://discord.gg/kode01', 'MessageSquare', 3)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.footer_social_links IS 'Social media links displayed in the website footer.';
