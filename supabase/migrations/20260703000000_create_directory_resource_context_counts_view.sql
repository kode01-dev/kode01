SET search_path = '';

CREATE OR REPLACE VIEW public.directory_resource_context_counts AS
SELECT
  directory_id,
  COALESCE(jsonb_array_length(skills_json), 0)::integer AS skills_count,
  COALESCE(jsonb_array_length(faq_json), 0)::integer AS faq_count,
  COALESCE(jsonb_array_length(commands_json), 0)::integer AS commands_count
FROM public.directory_resource_contexts;
