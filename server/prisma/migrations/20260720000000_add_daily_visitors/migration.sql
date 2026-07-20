-- Aggregate, privacy-preserving daily visitor signals.
-- One row per unique visitor per day. `visitor_hash` is a non-reversible,
-- daily-rotating fingerprint (no cookie, no stored IP/UA); it lets us count
-- unique visitors per day and aggregate country + device without identifying
-- anyone. Written by routes/public/track.ts via ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS "daily_visitors" (
  "id"           TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "visitor_hash" VARCHAR(64) NOT NULL,
  "country"      VARCHAR(2) NOT NULL DEFAULT 'XX',
  "device"       VARCHAR(16) NOT NULL DEFAULT 'desktop',
  CONSTRAINT "daily_visitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_visitors_date_visitor_hash_key"
  ON "daily_visitors" ("date", "visitor_hash");

CREATE INDEX IF NOT EXISTS "daily_visitors_date_idx"
  ON "daily_visitors" ("date");
