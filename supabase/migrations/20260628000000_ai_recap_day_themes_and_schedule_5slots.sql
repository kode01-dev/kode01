-- ============================================================
-- Migration: AI Recap Day Themes + 5-Slot Schedule + Fact-Check
-- ============================================================

-- 1. Create day themes table
CREATE TABLE IF NOT EXISTS ai_recap_day_themes (
  day_index smallint PRIMARY KEY CHECK (day_index BETWEEN 1 AND 5),
  theme_key text NOT NULL,
  theme_name_fr text NOT NULL,
  theme_name_en text NOT NULL,
  theme_description_fr text DEFAULT '',
  theme_description_en text DEFAULT '',
  source_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  skip_if_quiet boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_recap_day_themes IS 'Thematic day configuration for the 5-day AI news schedule (Mon=1 ... Fri=5)';

-- 2. Seed initial themes (source_ids will be populated via admin UI)
INSERT INTO ai_recap_day_themes (day_index, theme_key, theme_name_fr, theme_name_en, theme_description_fr, theme_description_en)
VALUES
  (1, 'world_recap',
    'Le Récap Mondial',
    'The World Recap',
    'Synthèse des avancées majeures du weekend et de la journée. Les 3 meilleures nouvelles IA mondiales.',
    'Synthesis of major weekend and daily breakthroughs. The top 3 global AI news stories.'),
  (2, 'open_source_dev',
    'L''Open Source & Dev',
    'Open Source & Dev',
    'Un nouveau modèle ouvert ou une librairie qui change la donne pour les builders.',
    'A new open model or library that changes the game for builders.'),
  (3, 'ai_economy',
    'L''Économie de l''IA',
    'The AI Economy',
    'Les puces, le hardware ou les méga-levées de fonds qui dictent le futur.',
    'The chips, hardware, or mega funding rounds shaping the future.'),
  (4, 'integration_society',
    'L''Intégration & Société',
    'Integration & Society',
    'Comment l''IA arrive dans nos OS, nos navigateurs ou nos lois.',
    'How AI is arriving in our operating systems, browsers, and laws.'),
  (5, 'perspective',
    'La Perspective',
    'The Perspective',
    'Un article de fond sur la sécurité, les limites de l''IA ou une vision long-terme.',
    'A deep-dive on AI safety, limitations, or long-term vision.')
ON CONFLICT (day_index) DO NOTHING;

-- 3. Add schedule slots C, D, E to support 5-day schedule
ALTER TABLE ai_recap_schedule_settings
  ADD COLUMN IF NOT EXISTS slot_c_day smallint DEFAULT 3,
  ADD COLUMN IF NOT EXISTS slot_c_hour smallint DEFAULT 6,
  ADD COLUMN IF NOT EXISTS slot_c_minute smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_d_day smallint DEFAULT 4,
  ADD COLUMN IF NOT EXISTS slot_d_hour smallint DEFAULT 6,
  ADD COLUMN IF NOT EXISTS slot_d_minute smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_e_day smallint DEFAULT 5,
  ADD COLUMN IF NOT EXISTS slot_e_hour smallint DEFAULT 6,
  ADD COLUMN IF NOT EXISTS slot_e_minute smallint DEFAULT 0;

-- 4. Add fact_check_result column to editions
ALTER TABLE ai_recap_editions
  ADD COLUMN IF NOT EXISTS fact_check_result jsonb DEFAULT NULL;

-- 5. RLS policies for day themes (admin only)
ALTER TABLE ai_recap_day_themes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_recap_day_themes' AND policyname = 'ai_recap_day_themes_admin_all'
  ) THEN
    CREATE POLICY ai_recap_day_themes_admin_all ON ai_recap_day_themes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- 6. Service role bypass for edge functions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_recap_day_themes' AND policyname = 'ai_recap_day_themes_service_all'
  ) THEN
    CREATE POLICY ai_recap_day_themes_service_all ON ai_recap_day_themes
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
