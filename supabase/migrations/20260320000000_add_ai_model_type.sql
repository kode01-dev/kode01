SET search_path = '';

-- Update type constraint
ALTER TABLE public.modules_directory DROP CONSTRAINT IF EXISTS modules_directory_type_check;
ALTER TABLE public.modules_directory ADD CONSTRAINT modules_directory_type_check CHECK (type IN ('ui', 'agent', 'mcp_server', 'ai_skill', 'open_source_app', 'ai_model'));

-- Migrate existing models from open_source_app to ai_model
UPDATE public.modules_directory 
SET type = 'ai_model' 
WHERE slug IN ('deepseek-v3');
