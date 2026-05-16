-- Migration to rename commission column to commission_kode01
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchases'
      AND column_name = 'commission_thiki'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchases'
      AND column_name = 'commission_kode01'
  ) THEN
    ALTER TABLE public.purchases RENAME COLUMN commission_thiki TO commission_kode01;
  END IF;
END $$;
