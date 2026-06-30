-- Rename DetectionType enum value SLOUCH → SLOUCHING (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'DetectionType' AND e.enumlabel = 'SLOUCH'
  ) THEN
    ALTER TYPE "DetectionType" RENAME VALUE 'SLOUCH' TO 'SLOUCHING';
  END IF;
END $$;
