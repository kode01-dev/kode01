-- Test-only vendor seed data.
-- Usage:
--   BEGIN;
--   SET LOCAL app.seed_test_vendors = 'on';
--   SET LOCAL app.seed_test_vendors_password = '<local-only-password>';
--   \i supabase/seeds/test_vendors.sql
--   COMMIT;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
SET search_path = extensions, public;

DO $$
DECLARE
  seed_enabled text := lower(coalesce(current_setting('app.seed_test_vendors', true), 'off'));
  seed_password text := nullif(current_setting('app.seed_test_vendors_password', true), '');

  v_tech_id uuid := '00000000-0000-0000-0000-000000000001';
  v_creative_id uuid := '00000000-0000-0000-0000-000000000002';
  v_guide_id uuid := '00000000-0000-0000-0000-000000000003';
  v_automation_id uuid := '00000000-0000-0000-0000-000000000004';
  v_code_id uuid := '00000000-0000-0000-0000-000000000005';

  cat_templates uuid;
  cat_creative uuid;
  cat_educational uuid;
  cat_technical uuid;

  sub_notion uuid;
  sub_docs uuid;
  sub_ui uuid;
  sub_graphics uuid;
  sub_ebooks uuid;
  sub_checklists uuid;
  sub_automations uuid;
  sub_snippets uuid;
BEGIN
  IF seed_enabled NOT IN ('1', 'on', 'true') THEN
    RAISE EXCEPTION 'Test seed blocked. Set app.seed_test_vendors=on for this session.';
  END IF;

  IF seed_password IS NULL THEN
    RAISE EXCEPTION 'Missing app.seed_test_vendors_password for test seed session.';
  END IF;

  SELECT id INTO cat_templates FROM public.product_categories WHERE slug = 'templates-structures';
  SELECT id INTO cat_creative FROM public.product_categories WHERE slug = 'creative-resources';
  SELECT id INTO cat_educational FROM public.product_categories WHERE slug = 'educational-content-guides';
  SELECT id INTO cat_technical FROM public.product_categories WHERE slug = 'technical-tools-code-automation';

  SELECT id INTO sub_notion FROM public.product_subcategories WHERE slug = 'notion-spaces';
  SELECT id INTO sub_docs FROM public.product_subcategories WHERE slug = 'document-templates';
  SELECT id INTO sub_ui FROM public.product_subcategories WHERE slug = 'ui-ux-kits';
  SELECT id INTO sub_graphics FROM public.product_subcategories WHERE slug = 'graphic-packs';
  SELECT id INTO sub_ebooks FROM public.product_subcategories WHERE slug = 'ebooks-guides';
  SELECT id INTO sub_checklists FROM public.product_subcategories WHERE slug = 'checklists';
  SELECT id INTO sub_automations FROM public.product_subcategories WHERE slug = 'automations';
  SELECT id INTO sub_snippets FROM public.product_subcategories WHERE slug = 'code-snippets';

  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    instance_id
  )
  VALUES
    (
      v_tech_id,
      'tech@test.com',
      extensions.crypt(seed_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"TechTemplate Studio"}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      '',
      '00000000-0000-0000-0000-000000000000'
    ),
    (
      v_creative_id,
      'creative@test.com',
      extensions.crypt(seed_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Creative Assets Co."}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      '',
      '00000000-0000-0000-0000-000000000000'
    ),
    (
      v_guide_id,
      'guide@test.com',
      extensions.crypt(seed_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Guide Pro"}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      '',
      '00000000-0000-0000-0000-000000000000'
    ),
    (
      v_automation_id,
      'auto@test.com',
      extensions.crypt(seed_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Automation Wizards"}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      '',
      '00000000-0000-0000-0000-000000000000'
    ),
    (
      v_code_id,
      'code@test.com',
      extensions.crypt(seed_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Code Base"}',
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      '',
      '00000000-0000-0000-0000-000000000000'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, role, display_name, shop_name, plan_type, is_verified)
  VALUES
    (v_tech_id, 'seller', 'TechTemplate Studio', 'TechTemplate Studio', 'pro', true),
    (v_creative_id, 'seller', 'Creative Assets Co.', 'Creative Assets Co.', 'pro', true),
    (v_guide_id, 'seller', 'Guide Pro', 'Guide Pro', 'pro', true),
    (v_automation_id, 'seller', 'Automation Wizards', 'Automation Wizards', 'pro', true),
    (v_code_id, 'seller', 'Code Base', 'Code Base', 'pro', true)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    shop_name = EXCLUDED.shop_name,
    plan_type = EXCLUDED.plan_type,
    is_verified = EXCLUDED.is_verified;

  INSERT INTO public.products (seller_id, title, slug, description, price, status, category_id, subcategory_id)
  VALUES
    (
      v_tech_id,
      'Ultimate Notion OS',
      'ultimate-notion-os',
      'A complete operating system for your life and business in Notion.',
      49.00,
      'published',
      cat_templates,
      sub_notion
    ),
    (
      v_tech_id,
      'Freelance Contract Pack',
      'freelance-contract-pack',
      'Legal templates for web developers and designers.',
      29.00,
      'published',
      cat_templates,
      sub_docs
    )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id;

  INSERT INTO public.products (seller_id, title, slug, description, price, status, category_id, subcategory_id)
  VALUES
    (
      v_creative_id,
      'SaaS UI Kit for Figma',
      'saas-ui-kit-figma',
      'Premium components for modern web applications.',
      79.00,
      'published',
      cat_creative,
      sub_ui
    ),
    (
      v_creative_id,
      'Abstract 3D Icon Set',
      'abstract-3d-icons',
      '50+ high-quality 3D icons for your next project.',
      19.00,
      'published',
      cat_creative,
      sub_graphics
    )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id;

  INSERT INTO public.products (seller_id, title, slug, description, price, status, category_id, subcategory_id)
  VALUES
    (
      v_guide_id,
      'The $10k Freelancer Guide',
      '10k-freelancer-guide',
      'Step-by-step strategy to scale your freelance business.',
      39.00,
      'published',
      cat_educational,
      sub_ebooks
    ),
    (
      v_guide_id,
      'SaaS Launch Checklist',
      'saas-launch-checklist',
      'Everything you need to do before hitting the publish button.',
      15.00,
      'published',
      cat_educational,
      sub_checklists
    )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id;

  INSERT INTO public.products (seller_id, title, slug, description, price, status, category_id, subcategory_id)
  VALUES
    (
      v_automation_id,
      'Content Repurposing Automation',
      'content-repurposing-auto',
      'Make.com scenario to turn one video into 10 social posts.',
      59.00,
      'published',
      cat_technical,
      sub_automations
    ),
    (
      v_automation_id,
      'Customer Support Bot Template',
      'customer-support-bot',
      'Zapier template for automated support handling.',
      45.00,
      'published',
      cat_technical,
      sub_automations
    )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id;

  INSERT INTO public.products (seller_id, title, slug, description, price, status, category_id, subcategory_id)
  VALUES
    (
      v_code_id,
      'Next.js 14 Dashboard Starter',
      'nextjs-dashboard-starter',
      'Production-ready dashboard with Auth and Stripe integration.',
      99.00,
      'published',
      cat_technical,
      sub_snippets
    ),
    (
      v_code_id,
      'Supabase RLS Helper Scripts',
      'supabase-rls-helpers',
      'Collection of SQL functions to manage complex RLS policies.',
      25.00,
      'published',
      cat_technical,
      sub_snippets
    )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    category_id = EXCLUDED.category_id,
    subcategory_id = EXCLUDED.subcategory_id;
END;
$$;
