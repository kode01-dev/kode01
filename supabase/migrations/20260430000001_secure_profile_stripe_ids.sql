-- Migration: Secure sensitive fields in profiles table
-- Problem: Public SELECT policy "Public profiles are viewable by everyone" exposes stripe_account_id and stripe_customer_id.
-- Solution: Create a restricted view or split the policy to only allow public access to non-sensitive fields.
-- In Supabase, we can use column-level security by splitting the table or using a view, but a more common approach for RLS is to restrict the entire row if any field is sensitive, OR to use a SELECT policy that only permits access to specific users for specific rows.
-- Since we WANT public access to display_name/avatar, we should change the public policy to a view or restrict the columns via RLS (which is harder in Postgres natively for column level).
-- Best practice: Update the profiles policy to only be viewable by the user themselves, and create a public view "public_profiles" for marketplace use that excludes Stripe IDs.

SET search_path = '';

-- 1. Drop the over-exposed public policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- 2. Create a restricted public policy that ONLY allows seeing non-sensitive profiles or use a more specific policy
-- Actually, a better way is to keep the "true" policy but ensure sensitive columns are handled. 
-- Since Postgres RLS is row-level, we should ideally move sensitive Stripe IDs to a private table `profile_billing`.

-- For now, let's at least restrict the SELECT policy to authenticated users for their own data, 
-- and only allow public read of basic fields through a View.

CREATE OR REPLACE VIEW public.profile_marketplace_data AS
SELECT 
    id,
    display_name,
    shop_name,
    avatar_url,
    role,
    is_verified,
    created_at
FROM public.profiles;

GRANT SELECT ON public.profile_marketplace_data TO anon, authenticated;

-- Ensure only the owner or admins can see the full profile (including Stripe IDs)
DROP POLICY IF EXISTS "Users and admins can view full profile" ON public.profiles;
CREATE POLICY "Users and admins can view full profile"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id 
    OR 
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Re-enable public read but only for standard fields via policy is not possible.
-- So we keep the view as the primary public entry point.
