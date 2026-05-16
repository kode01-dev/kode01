SET search_path = '';

INSERT INTO public.modules_directory (slug, title, description, github_url, json_config, type, is_free, technical_type)
VALUES
  (
    'kimi-k2-5', 
    'Kimi-K2.5', 
    'High-performance Next-Generation model from MoonshotAI, optimized for reasoning and complex tasks.', 
    'https://huggingface.co/moonshotai/Kimi-K2.5', 
    '{"full_name":"moonshotai/Kimi-K2.5","license_key":"proprietary","license_name":"Proprietary / Moonshot"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'glm-5', 
    'GLM-5', 
    'The latest generation of the General Language Model from Z.AI-org.', 
    'https://huggingface.co/zai-org/GLM-5', 
    '{"full_name":"zai-org/GLM-5","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'minimax-m2-5', 
    'MiniMax-M2.5', 
    'Advanced LLM from MiniMax-AI with strong multilingual and creative capabilities.', 
    'https://huggingface.co/MiniMaxAI/MiniMax-M2.5', 
    '{"full_name":"MiniMaxAI/MiniMax-M2.5","license_key":"proprietary","license_name":"Proprietary"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'deepseek-v3-1-base', 
    'DeepSeek-V3.1-Base', 
    'Next iteration of the DeepSeek series, providing a powerful foundation for reasoning and coding.', 
    'https://huggingface.co/deepseek-ai/DeepSeek-V3.1-Base', 
    '{"full_name":"deepseek-ai/DeepSeek-V3.1-Base","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'qwen2-5-vl-7b', 
    'Qwen2.5-VL', 
    'Cutting-edge Vision-Language model from the Qwen team, excelling in image understanding and multimodal reasoning.', 
    'https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct', 
    '{"full_name":"Qwen/Qwen2.5-VL-7B-Instruct","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'vl-model'
  ),
  (
    'gpt-oss', 
    'gpt-oss', 
    'OpenAI''s experimental open-source project exploring generative foundations.', 
    'https://github.com/openai/gpt-oss', 
    '{"full_name":"openai/gpt-oss","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'phi-4', 
    'Phi-4', 
    'Microsoft''s latest small language model, delivering high reasoning performance in a compact footprint.', 
    'https://huggingface.co/microsoft/phi-4', 
    '{"full_name":"microsoft/phi-4","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'slm'
  ),
  (
    'gemma-2-9b', 
    'Gemma 2 (9B)', 
    'Google''s high-efficiency open model built from the same research as Gemini.', 
    'https://huggingface.co/google/gemma-2-9b', 
    '{"full_name":"google/gemma-2-9b","license_key":"gemma","license_name":"Gemma Terms of Use"}'::jsonb, 
    'ai_model', 
    true,
    'slm'
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  github_url = EXCLUDED.github_url,
  json_config = EXCLUDED.json_config,
  type = EXCLUDED.type,
  technical_type = EXCLUDED.technical_type;
