-- Normalize legacy vendor role aliases to the canonical seller role.

SET search_path = '';

UPDATE public.profiles
SET role = 'seller'
WHERE lower(trim(role)) IN ('vendor', 'vendeur');
