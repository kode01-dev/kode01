-- Migration: Normalize legacy role values

SET search_path = '';

UPDATE public.profiles
SET role = 'seller'
WHERE role = 'vendeur';

