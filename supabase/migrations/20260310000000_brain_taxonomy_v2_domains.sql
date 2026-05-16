SET search_path = '';

-- ============================================================
-- BRAIN TAXONOMY v2 - Domains (multi-tags)
-- ============================================================
-- directory_domains = domain catalog
-- modules_directory_domains = many-to-many assignment with one primary domain
-- modules_directory.category remains as legacy mirror of primary domain
-- ============================================================

CREATE TABLE IF NOT EXISTS public.directory_domains (
    slug TEXT PRIMARY KEY CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    label_key TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.directory_domains (slug, label_key, display_order, is_active)
VALUES
    ('collection', 'Directory.categories.collection', 10, true),
    ('dev-tools', 'Directory.categories.dev-tools', 20, true),
    ('framework', 'Directory.categories.framework', 30, true),
    ('security', 'Directory.categories.security', 40, true),
    ('ai-ml', 'Directory.categories.ai-ml', 50, true),
    ('marketing', 'Directory.categories.marketing', 60, true),
    ('ui', 'Directory.categories.ui', 70, true),
    ('methodology', 'Directory.categories.methodology', 80, true),
    ('testing', 'Directory.categories.testing', 90, true),
    ('integration', 'Directory.categories.integration', 100, true),
    ('database', 'Directory.categories.database', 110, true),
    ('automation', 'Directory.categories.automation', 120, true),
    ('productivity', 'Directory.categories.productivity', 130, true)
ON CONFLICT (slug)
DO UPDATE SET
    label_key = EXCLUDED.label_key,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.modules_directory_domains (
    directory_id UUID NOT NULL REFERENCES public.modules_directory(id) ON DELETE CASCADE,
    domain_slug TEXT NOT NULL REFERENCES public.directory_domains(slug),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (directory_id, domain_slug)
);

CREATE INDEX IF NOT EXISTS idx_modules_directory_domains_domain_slug
    ON public.modules_directory_domains(domain_slug);

CREATE INDEX IF NOT EXISTS idx_modules_directory_domains_directory_id
    ON public.modules_directory_domains(directory_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_directory_domains_one_primary
    ON public.modules_directory_domains(directory_id)
    WHERE is_primary = true;

ALTER TABLE public.directory_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules_directory_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public directory domains are viewable by everyone." ON public.directory_domains;
CREATE POLICY "Public directory domains are viewable by everyone."
    ON public.directory_domains FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins can insert directory domains." ON public.directory_domains;
CREATE POLICY "Admins can insert directory domains."
    ON public.directory_domains FOR INSERT
    WITH CHECK (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update directory domains." ON public.directory_domains;
CREATE POLICY "Admins can update directory domains."
    ON public.directory_domains FOR UPDATE
    USING (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'))
    WITH CHECK (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete directory domains." ON public.directory_domains;
CREATE POLICY "Admins can delete directory domains."
    ON public.directory_domains FOR DELETE
    USING (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

DROP POLICY IF EXISTS "Public module domains are viewable by everyone." ON public.modules_directory_domains;
CREATE POLICY "Public module domains are viewable by everyone."
    ON public.modules_directory_domains FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins can insert module domains." ON public.modules_directory_domains;
CREATE POLICY "Admins can insert module domains."
    ON public.modules_directory_domains FOR INSERT
    WITH CHECK (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update module domains." ON public.modules_directory_domains;
CREATE POLICY "Admins can update module domains."
    ON public.modules_directory_domains FOR UPDATE
    USING (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'))
    WITH CHECK (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete module domains." ON public.modules_directory_domains;
CREATE POLICY "Admins can delete module domains."
    ON public.modules_directory_domains FOR DELETE
    USING (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin'));

-- Backfill primary domain from legacy category (fallback: collection)
INSERT INTO public.modules_directory_domains (directory_id, domain_slug, is_primary)
SELECT
    md.id,
    COALESCE(md.category, 'collection') AS domain_slug,
    true AS is_primary
FROM public.modules_directory md
WHERE COALESCE(md.category, 'collection') IN (SELECT slug FROM public.directory_domains)
ON CONFLICT (directory_id, domain_slug)
DO UPDATE SET is_primary = EXCLUDED.is_primary;

-- Enforce a single primary domain per directory item
WITH ranked_domains AS (
    SELECT
        mdd.directory_id,
        mdd.domain_slug,
        row_number() OVER (
            PARTITION BY mdd.directory_id
            ORDER BY mdd.is_primary DESC, mdd.created_at ASC, mdd.domain_slug ASC
        ) AS rn
    FROM public.modules_directory_domains mdd
)
UPDATE public.modules_directory_domains mdd
SET is_primary = (rd.rn = 1)
FROM ranked_domains rd
WHERE mdd.directory_id = rd.directory_id
  AND mdd.domain_slug = rd.domain_slug;

CREATE OR REPLACE FUNCTION public.sync_modules_directory_category_from_primary_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_directory_id UUID;
    v_primary_domain TEXT;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_directory_id := COALESCE(NEW.directory_id, OLD.directory_id);

    SELECT mdd.domain_slug
    INTO v_primary_domain
    FROM public.modules_directory_domains mdd
    WHERE mdd.directory_id = v_directory_id
      AND mdd.is_primary = true
    ORDER BY mdd.created_at ASC
    LIMIT 1;

    IF v_primary_domain IS NOT NULL THEN
        UPDATE public.modules_directory
        SET category = v_primary_domain
        WHERE id = v_directory_id
          AND category IS DISTINCT FROM v_primary_domain;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_primary_domain_from_modules_directory_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.category IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.category IS NOT DISTINCT FROM OLD.category THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.directory_domains dd
        WHERE dd.slug = NEW.category
    ) THEN
        RETURN NEW;
    END IF;

    UPDATE public.modules_directory_domains
    SET is_primary = false
    WHERE directory_id = NEW.id
      AND is_primary = true
      AND domain_slug <> NEW.category;

    INSERT INTO public.modules_directory_domains (directory_id, domain_slug, is_primary)
    VALUES (NEW.id, NEW.category, true)
    ON CONFLICT (directory_id, domain_slug)
    DO UPDATE SET is_primary = true;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_modules_directory_category_from_primary_domain_tg ON public.modules_directory_domains;
CREATE TRIGGER sync_modules_directory_category_from_primary_domain_tg
    AFTER INSERT OR UPDATE OR DELETE ON public.modules_directory_domains
    FOR EACH ROW EXECUTE FUNCTION public.sync_modules_directory_category_from_primary_domain();

DROP TRIGGER IF EXISTS sync_primary_domain_from_modules_directory_category_tg ON public.modules_directory;
CREATE TRIGGER sync_primary_domain_from_modules_directory_category_tg
    AFTER INSERT OR UPDATE OF category ON public.modules_directory
    FOR EACH ROW EXECUTE FUNCTION public.sync_primary_domain_from_modules_directory_category();

-- Ensure legacy category mirrors the current primary domain
UPDATE public.modules_directory md
SET category = primary_domains.domain_slug
FROM (
    SELECT mdd.directory_id, mdd.domain_slug
    FROM public.modules_directory_domains mdd
    WHERE mdd.is_primary = true
) AS primary_domains
WHERE md.id = primary_domains.directory_id
  AND md.category IS DISTINCT FROM primary_domains.domain_slug;
