-- Harden RPC execution after the app has moved all writes behind trusted server routes.

REVOKE ALL ON FUNCTION public.reserve_news_inventory(uuid, text, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_news_inventory(uuid, text, integer, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_news_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_news_inventory(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_article_clap(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_article_clap(uuid, text, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.log_audit_event(text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit_detailed(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_detailed(text, integer, integer) TO service_role;
