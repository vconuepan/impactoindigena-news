-- Migration: add source column to page_views for traffic attribution
-- Run this in pgAdmin before deploying the server update.

-- Step 1: Add the column with empty-string default (NOT NULL, backward-compatible)
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) NOT NULL DEFAULT '';

-- Step 2: Drop the old (path, date) unique constraint
ALTER TABLE "page_views" DROP CONSTRAINT IF EXISTS "page_views_path_date_key";

-- Step 3: Add the new (path, date, source) unique constraint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_path_date_source_key" UNIQUE ("path", "date", "source");

-- Step 4: Add an index on source for analytics group-by queries
CREATE INDEX IF NOT EXISTS "page_views_source_idx" ON "page_views" ("source");
