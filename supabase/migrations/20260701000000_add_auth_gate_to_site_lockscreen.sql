-- Add a dedicated auth gate toggle to site lockscreen config.
-- This enables locking login/signup while keeping the public site crawlable for SEO audits.

ALTER TABLE public.site_lockscreen_config
  ADD COLUMN IF NOT EXISTS auth_gate_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_lockscreen_config.auth_gate_enabled IS
  'When true, login/signup access requires prelaunch password unlock.';
