-- AddColumn: lat and lng for map display
ALTER TABLE "communities" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "communities" ADD COLUMN "lng" DOUBLE PRECISION;
