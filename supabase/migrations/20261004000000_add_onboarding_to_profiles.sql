-- Migration: Add onboarding_completed flag to profiles
-- Used by the Welcome Flow modal to track first-login onboarding completion
-- SOC 2: search_path hardened

SET search_path = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
