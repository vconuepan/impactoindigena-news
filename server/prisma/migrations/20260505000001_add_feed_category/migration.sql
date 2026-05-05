-- AlterTable: add feed_category column to feeds
ALTER TABLE "feeds" ADD COLUMN "feed_category" TEXT NOT NULL DEFAULT 'INDIGENOUS';
