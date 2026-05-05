# Backlog

## Comunidades y usuarios

- Map for PUEBLO/TERRITORIO communities (requires lat/lng migration + react-leaflet)

## Developer experience

- **Startup env validation** — Add a check in `server/src/index.ts` that validates required env vars (`DATABASE_URL`, `JWT_SECRET`, `LLM_PROVIDER`) on boot and exits with a clear error message if any are missing. Currently a missing var fails deep in a request handler with a cryptic message. Especially useful for new contributors setting up from `.env.sample`. ~20 lines.

## Public site

- Compare: relevance stats against international media (SPIEGEL, BBC, etc.)
