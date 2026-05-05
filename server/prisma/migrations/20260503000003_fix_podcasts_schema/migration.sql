-- Add missing columns to podcasts table (schema drift from impactoindigena.ai shared DB)
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "audio_url" TEXT;
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "duration" INTEGER;
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "episode_number" INTEGER;
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);
