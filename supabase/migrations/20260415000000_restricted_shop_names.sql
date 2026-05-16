-- Create table for restricted shop names
CREATE TABLE IF NOT EXISTS public.restricted_shop_names (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT UNIQUE NOT NULL,
    is_regex BOOLEAN DEFAULT false,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.restricted_shop_names ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
-- Allow authenticated users to read for validation purposes
CREATE POLICY "Allow authenticated to read restricted shop names"
ON public.restricted_shop_names
FOR SELECT
TO authenticated
USING (true);

-- Allow admins to manage the table
CREATE POLICY "Allow admins to manage restricted shop names"
ON public.restricted_shop_names
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Seed initial data (lowercase and trimmed)
INSERT INTO public.restricted_shop_names (keyword, reason) VALUES
('kode01', 'Marque principale'),
('kode', 'Variante marque'),
('k0de', 'Variante fraudulente'),
('k0de01', 'Variante fraudulente'),
('admin', 'Réservé au staff'),
('administrator', 'Réservé au staff'),
('support', 'Réservé au support'),
('official', 'Confusion possible'),
('staff', 'Réservé au personnel'),
('moderator', 'Réservé aux modérateurs'),
('billing', 'Terme sensible payement'),
('security', 'Terme sensible sécurité'),
('payment', 'Terme sensible payement'),
('payout', 'Terme sensible payement'),
('stripe', 'Partenaire tiers réservé'),
('verified', 'Badge de confiance usurpé'),
('certified', 'Badge de confiance usurpé'),
('trust', 'Confusion possible'),
('thiki', 'Ancien nom du projet'),
('displa', 'Nom du projet parent');

-- Clean keywords: lowercase and trim
UPDATE public.restricted_shop_names SET keyword = LOWER(TRIM(keyword));
