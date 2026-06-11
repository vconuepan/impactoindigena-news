-- CreateEnum
CREATE TYPE "NarrativeFrame" AS ENUM ('confrontacion', 'resiliencia', 'protagonismo', 'alianza');

-- AlterTable
ALTER TABLE "stories" ADD COLUMN "narrative_frame" "NarrativeFrame";
