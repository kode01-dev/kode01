SET search_path = '';

INSERT INTO public.modules_directory (slug, title, description, github_url, json_config, type, is_free, technical_type)
VALUES
  (
    'all-minilm-l6-v2', 
    'all-MiniLM-L6-v2', 
    'A fast and efficient sentence-transformers model for mapping sentences to a 384 dimensional dense vector space.', 
    'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2', 
    '{"full_name":"sentence-transformers/all-MiniLM-L6-v2","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'embedding-model'
  ),
  (
    'bert-base-uncased', 
    'BERT Base Uncased', 
    'The classic bidirectional encoder representation from transformers, pre-trained on a large corpus of English data.', 
    'https://huggingface.co/google-bert/bert-base-uncased', 
    '{"full_name":"google-bert/bert-base-uncased","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'encoder-model'
  ),
  (
    'electra-base-discriminator', 
    'ELECTRA Base Discriminator', 
    'A more efficient pre-training approach for language representation models that detects replaced tokens.', 
    'https://huggingface.co/google/electra-base-discriminator', 
    '{"full_name":"google/electra-base-discriminator","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'encoder-model'
  ),
  (
    'nsfw-image-detection', 
    'NSFW Image Detection', 
    'Detection model to identify Not Safe For Work (NSFW) content in images.', 
    'https://huggingface.co/Falconsai/nsfw_image_detection', 
    '{"full_name":"Falconsai/nsfw_image_detection","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'vision-model'
  ),
  (
    'all-mpnet-base-v2', 
    'all-mpnet-base-v2', 
    'A high-accuracy sentence embedding model based on the MPNet architecture.', 
    'https://huggingface.co/sentence-transformers/all-mpnet-base-v2', 
    '{"full_name":"sentence-transformers/all-mpnet-base-v2","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'embedding-model'
  ),
  (
    'mobilenetv3-small', 
    'MobileNetV3 Small', 
    'Efficient vision model (timm implementation) for mobile and low-resource environments.', 
    'https://huggingface.co/timm/mobilenetv3_small_100.lamb_in1k', 
    '{"full_name":"timm/mobilenetv3_small_100","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'vision-model'
  ),
  (
    'roberta-large', 
    'RoBERTa Large', 
    'A robustly optimized BERT pretraining approach with improved hyperparameters and training data.', 
    'https://huggingface.co/FacebookAI/roberta-large', 
    '{"full_name":"FacebookAI/roberta-large","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'encoder-model'
  ),
  (
    'paraphrase-multilingual-minilm-l12-v2', 
    'Paraphrase Multilingual MiniLM-L12-v2', 
    'Sentence-transformers model for multilingual paraphrasability, supporting 50+ languages.', 
    'https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 
    '{"full_name":"sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'embedding-model'
  ),
  (
    'qwen2-5-7b-instruct', 
    'Qwen2.5-7B-Instruct', 
    'Alibaba''s powerful 7B instruction-tuned model, delivering state-of-the-art performance for its size.', 
    'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct', 
    '{"full_name":"Qwen/Qwen2.5-7B-Instruct","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'llm'
  ),
  (
    'clap-htsat-fused', 
    'CLAP HTSAT Fused', 
    'Contrastive Language-Audio Pretraining model for cross-modal retrieval and classification.', 
    'https://huggingface.co/laion/clap-htsat-fused', 
    '{"full_name":"laion/clap-htsat-fused","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'audio-model'
  ),
  (
    'clip-vit-base-patch32', 
    'CLIP ViT Base Patch32', 
    'Contrastive Language-Image Pretraining by OpenAI, connecting vision and text representations.', 
    'https://huggingface.co/openai/clip-vit-base-patch32', 
    '{"full_name":"openai/clip-vit-base-patch32","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'vl-model'
  ),
  (
    'xlm-roberta-base', 
    'XLM-RoBERTa Base', 
    'A multilingual version of RoBERTa pre-trained on 2.5TB of filtered CommonCrawl data.', 
    'https://huggingface.co/FacebookAI/xlm-roberta-base', 
    '{"full_name":"FacebookAI/xlm-roberta-base","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'encoder-model'
  ),
  (
    'chronos-2', 
    'Chronos-2', 
    'Amazon''s Chronos model for zero-shot time series forecasting based on language model architectures.', 
    'https://huggingface.co/amazon/chronos-2', 
    '{"full_name":"amazon/chronos-2","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'time-series-model'
  ),
  (
    'bge-m3', 
    'BGE-M3', 
    'BAAI general embedding model supporting multi-linguality, multi-granularity, and multi-functionality.', 
    'https://huggingface.co/BAAI/bge-m3', 
    '{"full_name":"BAAI/bge-m3","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'embedding-model'
  ),
  (
    'adetailer', 
    'ADetailer', 
    'After Detailer - a face/body segmenting and detail enhancement model for stable diffusion workflows.', 
    'https://huggingface.co/Bingsu/adetailer', 
    '{"full_name":"Bingsu/adetailer","license_key":"apache-2.0","license_name":"Apache 2.0"}'::jsonb, 
    'ai_model', 
    true,
    'vision-model'
  ),
  (
    'wespeaker-voxceleb', 
    'wespeaker-voxceleb-resnet34', 
    'Speaker verification and diarization model trained on the VoxCeleb dataset.', 
    'https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM', 
    '{"full_name":"pyannote/wespeaker-voxceleb","license_key":"mit","license_name":"MIT"}'::jsonb, 
    'ai_model', 
    true,
    'audio-model'
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  github_url = EXCLUDED.github_url,
  json_config = EXCLUDED.json_config,
  type = EXCLUDED.type,
  technical_type = EXCLUDED.technical_type;
