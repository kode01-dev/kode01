-- Migration: Product taxonomy for market explore
-- Adds hierarchical category/subcategory taxonomy for products with legacy category compatibility.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT,
  description_fr TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT,
  description_fr TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_display_order ON public.product_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_product_categories_is_active ON public.product_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_product_subcategories_category_id ON public.product_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_subcategories_display_order ON public.product_subcategories(display_order);
CREATE INDEX IF NOT EXISTS idx_product_subcategories_is_active ON public.product_subcategories(is_active);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product categories are viewable by everyone" ON public.product_categories;
CREATE POLICY "Product categories are viewable by everyone"
  ON public.product_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Product subcategories are viewable by everyone" ON public.product_subcategories;
CREATE POLICY "Product subcategories are viewable by everyone"
  ON public.product_subcategories FOR SELECT
  USING (true);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategory_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'products_category_id_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.product_categories(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'products_subcategory_id_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_subcategory_id_fkey
      FOREIGN KEY (subcategory_id)
      REFERENCES public.product_subcategories(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON public.products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_category_subcategory_id ON public.products(category_id, subcategory_id);

INSERT INTO public.product_categories (slug, name_en, name_fr, description_en, description_fr, display_order, is_active)
VALUES
  ('templates-structures', 'Templates & Structures', 'Templates et structures', 'Notion workspaces, document templates, and ready-to-use database structures.', 'Espaces Notion, modeles de documents, et structures de bases de donnees pretes a l''emploi.', 10, true),
  ('creative-resources', 'Creative Resources', 'Ressources creatives', 'UI/UX kits, graphic packs, and visual presets.', 'Kits UI/UX, packs graphiques, et presets visuels.', 20, true),
  ('educational-content-guides', 'Educational Content & Guides', 'Contenu educatif et guides', 'E-books, checklists, and mini courses for practical execution.', 'E-books, checklists, et mini-formations pour une execution pratique.', 30, true),
  ('technical-tools-code-automation', 'Technical Tools (Code & Automation)', 'Outils techniques (code et automatisation)', 'Code snippets and automation workflows ready to deploy.', 'Snippets de code et flux d''automatisation prets a deployer.', 40, true)
ON CONFLICT (slug) DO UPDATE
SET
  name_en = EXCLUDED.name_en,
  name_fr = EXCLUDED.name_fr,
  description_en = EXCLUDED.description_en,
  description_fr = EXCLUDED.description_fr,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

INSERT INTO public.product_subcategories (
  category_id,
  slug,
  name_en,
  name_fr,
  description_en,
  description_fr,
  display_order,
  is_active
)
SELECT
  pc.id,
  seeded.slug,
  seeded.name_en,
  seeded.name_fr,
  seeded.description_en,
  seeded.description_fr,
  seeded.display_order,
  true
FROM (
  VALUES
    ('templates-structures', 'notion-spaces', 'Notion Spaces', 'Espaces Notion', 'Dashboards, project systems, and CRM workspaces in Notion.', 'Tableaux de bord, systemes de gestion de projets et CRM dans Notion.', 10),
    ('templates-structures', 'document-templates', 'Document Templates', 'Modeles de documents', 'Contract templates, business proposals, and pricing sheets.', 'Contrats types, propositions commerciales et grilles tarifaires.', 20),
    ('templates-structures', 'database-structures', 'Database Structures', 'Structures de bases de donnees', 'Ready-to-use data models for Supabase or Airtable.', 'Structures de donnees pretes a l''emploi pour Supabase ou Airtable.', 30),
    ('creative-resources', 'ui-ux-kits', 'UI/UX Kits', 'Kits UI/UX', 'Figma components and wireframe systems for web and mobile.', 'Composants Figma et wireframes pour web et mobile.', 10),
    ('creative-resources', 'graphic-packs', 'Graphic Packs', 'Packs graphiques', 'Icons, textures, fonts, and vector illustrations.', 'Icones, textures, polices, et illustrations vectorielles.', 20),
    ('creative-resources', 'presets', 'Presets', 'Presets', 'Lightroom presets and CSS/Tailwind styling presets.', 'Presets Lightroom et configurations CSS/Tailwind.', 30),
    ('educational-content-guides', 'ebooks-guides', 'E-books & Guides', 'E-books et guides', 'Practical technical guides and strategy playbooks.', 'Guides pratiques techniques et playbooks de strategie.', 10),
    ('educational-content-guides', 'checklists', 'Checklists', 'Checklists', 'Actionable checklists for launches, SEO, and compliance.', 'Listes de controle pour lancements, SEO, et conformite.', 20),
    ('educational-content-guides', 'mini-courses', 'Mini Courses', 'Mini-formations', 'Short video trainings and focused tutorials.', 'Mini-formations video et tutoriels cibles.', 30),
    ('technical-tools-code-automation', 'code-snippets', 'Code Snippets', 'Snippets de code', 'Reusable snippets for Next.js, React, backend, and APIs.', 'Snippets reutilisables pour Next.js, React, backend, et APIs.', 10),
    ('technical-tools-code-automation', 'automations', 'Automations', 'Automatisations', 'Exportable scenarios for Make.com, Zapier, and workflow tools.', 'Scenarios exportables pour Make.com, Zapier, et outils de workflow.', 20)
) AS seeded(category_slug, slug, name_en, name_fr, description_en, description_fr, display_order)
JOIN public.product_categories AS pc
  ON pc.slug = seeded.category_slug
ON CONFLICT (slug) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  name_en = EXCLUDED.name_en,
  name_fr = EXCLUDED.name_fr,
  description_en = EXCLUDED.description_en,
  description_fr = EXCLUDED.description_fr,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.sync_products_taxonomy_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_category_slug TEXT;
  v_subcategory_category_id UUID;
BEGIN
  IF NEW.subcategory_id IS NOT NULL THEN
    SELECT ps.category_id
    INTO v_subcategory_category_id
    FROM public.product_subcategories AS ps
    WHERE ps.id = NEW.subcategory_id;

    IF v_subcategory_category_id IS NULL THEN
      RAISE EXCEPTION 'Unknown product subcategory ID: %', NEW.subcategory_id;
    END IF;

    IF NEW.category_id IS NULL THEN
      NEW.category_id := v_subcategory_category_id;
    ELSIF NEW.category_id IS DISTINCT FROM v_subcategory_category_id THEN
      RAISE EXCEPTION 'Product subcategory % does not belong to category %', NEW.subcategory_id, NEW.category_id;
    END IF;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT pc.slug
    INTO v_category_slug
    FROM public.product_categories AS pc
    WHERE pc.id = NEW.category_id;

    IF v_category_slug IS NULL THEN
      RAISE EXCEPTION 'Unknown product category ID: %', NEW.category_id;
    END IF;

    NEW.category := v_category_slug;
  ELSE
    NEW.subcategory_id := NULL;
    NEW.category := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_products_taxonomy_fields_tg ON public.products;
CREATE TRIGGER sync_products_taxonomy_fields_tg
  BEFORE INSERT OR UPDATE OF category_id, subcategory_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_products_taxonomy_fields();

CREATE OR REPLACE FUNCTION public.sync_products_legacy_category_on_category_slug_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.products
  SET category = NEW.slug
  WHERE category_id = NEW.id
    AND category IS DISTINCT FROM NEW.slug;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_products_legacy_category_on_category_slug_change_tg ON public.product_categories;
CREATE TRIGGER sync_products_legacy_category_on_category_slug_change_tg
  AFTER UPDATE OF slug
  ON public.product_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_products_legacy_category_on_category_slug_change();

WITH normalized AS (
  SELECT
    p.id,
    lower(trim(concat_ws(' ',
      COALESCE(p.category, ''),
      COALESCE(array_to_string(p.tags, ' '), '')
    ))) AS haystack
  FROM public.products AS p
),
mapped AS (
  SELECT
    n.id,
    CASE
      WHEN n.haystack ~ '(notion)' THEN 'notion-spaces'
      WHEN n.haystack ~ '(contract|proposal|document|pricing|tarif|quote)' THEN 'document-templates'
      WHEN n.haystack ~ '(supabase|airtable|database|crm)' THEN 'database-structures'
      WHEN n.haystack ~ '(figma|wireframe|ui|ux)' THEN 'ui-ux-kits'
      WHEN n.haystack ~ '(icon|illustration|vector|texture|font|graphic)' THEN 'graphic-packs'
      WHEN n.haystack ~ '(preset|lightroom|tailwind|css)' THEN 'presets'
      WHEN n.haystack ~ '(ebook|e-book|guide|how[- ]?to|branding)' THEN 'ebooks-guides'
      WHEN n.haystack ~ '(checklist|audit|seo|anti[- ]?spam|compliance)' THEN 'checklists'
      WHEN n.haystack ~ '(mini[- ]?course|course|tutorial|video|formation)' THEN 'mini-courses'
      WHEN n.haystack ~ '(snippet|script|react|next\\.js|nextjs|backend|api|function|integration)' THEN 'code-snippets'
      WHEN n.haystack ~ '(automation|automate|zapier|make\\.com|integromat|workflow|n8n)' THEN 'automations'
      ELSE NULL
    END AS subcategory_slug
  FROM normalized AS n
),
resolved AS (
  SELECT
    m.id,
    psc.slug AS resolved_subcategory_slug,
    COALESCE(
      pc_from_sub.slug,
      CASE
        WHEN n.haystack ~ '(figma|wireframe|ui|ux|icon|illustration|vector|texture|font|graphic|preset|lightroom|tailwind|css)'
          THEN 'creative-resources'
        WHEN n.haystack ~ '(ebook|e-book|guide|how[- ]?to|branding|checklist|audit|seo|anti[- ]?spam|compliance|mini[- ]?course|course|tutorial|video|formation)'
          THEN 'educational-content-guides'
        WHEN n.haystack ~ '(snippet|script|react|next\\.js|nextjs|backend|api|function|integration|automation|automate|zapier|make\\.com|integromat|workflow|n8n)'
          THEN 'technical-tools-code-automation'
        WHEN n.haystack ~ '(notion|contract|proposal|document|pricing|tarif|quote|supabase|airtable|database|crm|template)'
          THEN 'templates-structures'
        ELSE 'templates-structures'
      END
    ) AS resolved_category_slug
  FROM mapped AS m
  JOIN normalized AS n ON n.id = m.id
  LEFT JOIN public.product_subcategories AS psc ON psc.slug = m.subcategory_slug
  LEFT JOIN public.product_categories AS pc_from_sub ON pc_from_sub.id = psc.category_id
),
resolved_ids AS (
  SELECT
    r.id,
    pc.id AS category_id,
    psc.id AS subcategory_id
  FROM resolved AS r
  LEFT JOIN public.product_categories AS pc
    ON pc.slug = r.resolved_category_slug
  LEFT JOIN public.product_subcategories AS psc
    ON psc.slug = r.resolved_subcategory_slug
)
UPDATE public.products AS p
SET
  category_id = resolved_ids.category_id,
  subcategory_id = resolved_ids.subcategory_id
FROM resolved_ids
WHERE p.id = resolved_ids.id
  AND (
    p.category_id IS DISTINCT FROM resolved_ids.category_id
    OR p.subcategory_id IS DISTINCT FROM resolved_ids.subcategory_id
  );

UPDATE public.products AS p
SET category_id = pc.id
FROM public.product_categories AS pc
WHERE pc.slug = 'templates-structures'
  AND p.status = 'published'
  AND p.category_id IS NULL;

UPDATE public.products AS p
SET category = pc.slug
FROM public.product_categories AS pc
WHERE p.category_id = pc.id
  AND p.category IS DISTINCT FROM pc.slug;
