-- Add slouch_sec and slouch_count to daily_stats
ALTER TABLE "daily_stats" ADD COLUMN "slouch_sec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "daily_stats" ADD COLUMN "slouch_count" INTEGER NOT NULL DEFAULT 0;

-- Add slouch_sec to daily_slot_stats
ALTER TABLE "daily_slot_stats" ADD COLUMN "slouch_sec" INTEGER NOT NULL DEFAULT 0;
