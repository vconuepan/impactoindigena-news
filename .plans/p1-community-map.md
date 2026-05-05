# P1 — Community Map: lat/lng migration + live community pins

**Date:** 2026-05-05  
**Goal:** Extend the existing map at `/mapa` to show live community pins driven by the database, so each `Community` with coordinates appears as a clickable marker linking to its news page.

## What Already Exists (no need to build)
- react-leaflet + leaflet installed in client
- `MapWidget.tsx` with interactive map of 10 hardcoded Chilean pueblos
- `MapPage.tsx` at `/mapa` with lazy-load + SEO
- `CommunityDirectoryPage.tsx` at `/comunidades`
- `CommunityPage.tsx` at `/comunidad/:slug`
- `GET /api/communities` public endpoint
- Admin `CommunitiesAdminPage.tsx` (active toggle only)
- Admin `PATCH /api/admin/communities/:id` (active field only)

## What Needs to Be Built

### Step 1 — Schema: Add lat/lng to Community model
File: `server/prisma/schema.prisma`  
Add two nullable Float fields: `lat` and `lng`.

### Step 2 — Migration SQL
File: `server/prisma/migrations/20260505000000_add_community_lat_lng/migration.sql`  
```sql
ALTER TABLE communities ADD COLUMN lat DOUBLE PRECISION;
ALTER TABLE communities ADD COLUMN lng DOUBLE PRECISION;
```
User runs in pgAdmin → Claude marks as applied → Claude regenerates Prisma client.

### Step 3 — Shared types
File: `shared/types/index.ts`  
Add `lat?: number | null` and `lng?: number | null` to `Community` interface.

### Step 4 — Admin backend
File: `server/src/routes/admin/communities.ts`  
Extend PATCH to accept `lat: number | null` and `lng: number | null` alongside `active`.

### Step 5 — Admin API client
File: `client/src/lib/admin-api.ts`  
Add `lat` and `lng` to `AdminCommunity` interface.  
Add `updateCoordinates(id, lat, lng)` method.

### Step 6 — Admin UI
File: `client/src/pages/admin/CommunitiesAdminPage.tsx`  
Add coordinates edit panel: lat/lng numeric inputs per community row, save button.

### Step 7 — MapWidget: community layer
File: `client/src/components/MapWidget.tsx`  
Fetch `/api/communities` inside MapWidget.  
For each community with lat/lng set, render a CircleMarker with popup linking to `/comunidad/:slug`.  
Style: smaller, distinct color (gray/slate) to distinguish from educational markers.

### Step 8 — CommunityDirectoryPage: map link
File: `client/src/pages/CommunityDirectoryPage.tsx`  
Add "Ver en mapa →" link in the header area pointing to `/mapa`.

## Migration Flow
1. Edit schema → create SQL file → user applies in pgAdmin → mark applied → regenerate client
2. Build and verify no TS errors

## Out of Scope (later)
- `/mapa` filtered view per community type
- Map on individual CommunityPage (small locator widget)
- Polygon support for community territories
