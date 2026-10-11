# Authentication

> **Spec:** [`.specs/authentication.allium`](../.specs/authentication.allium) -- entity definitions, token rotation rules, reuse detection, role hierarchy, rate limiting. This file covers implementation details.

The admin panel uses JWT-only authentication: access tokens (15 min) with httpOnly refresh token cookies (24 hours) for browser sessions. A separate `requireApiKey` middleware exists for public API consumers (mobile apps, etc.) that need authenticated read access — the static API key cannot access admin endpoints.

## Architecture

### Server

- **Auth middleware** (`server/src/middleware/auth.ts`): `requireAuth` accepts JWT only (used on admin routes). `requireApiKey` accepts the static `PUBLIC_API_KEY` (used on public API routes that need authenticated access). `requireRole(...roles)` checks user role after auth.
- **Auth service** (`server/src/services/auth.ts`): Password hashing (bcryptjs, 12 rounds), JWT generation/verification (`JWT_SECRET` env var, 15 min expiry), refresh token creation/rotation/revocation (stored in `refresh_tokens` DB table, 24h expiry). Includes token reuse detection via family tracking -- if a rotated token is reused, all tokens in the family are revoked.
- **User service** (`server/src/services/user.ts`): CRUD operations for user management. Returns sanitized objects (no `passwordHash`).
- **Auth routes** (`server/src/routes/auth.ts`): Public routes at `/api/auth` — login, refresh, logout, me. Login and refresh endpoints are rate-limited (`authLimiter`: 5 req/15 min, `refreshLimiter`: 30 req/15 min) via `server/src/middleware/rateLimit.ts`.
- **User routes** (`server/src/routes/admin/users.ts`): Admin-only CRUD at `/api/admin/users`. Blocks self-delete, revokes tokens on user deletion. Includes `PUT /api/admin/users/:id/password` for password changes (self-change requires current password; admins can reset any user's password).

### Client

- **Auth context** (`client/src/lib/auth.tsx`): `AuthProvider` wraps the app. On mount, attempts silent refresh via cookie. Exposes `user`, `isAuthenticated`, `login(email, password)`, `logout()`.
- **API client** (`client/src/lib/admin-api.ts`): Access token stored in module-scoped variable (not localStorage — XSS-safe). On 401, auto-refreshes via `/api/auth/refresh` and retries. Deduplicates concurrent refresh calls.
- **Login page** (`client/src/pages/admin/LoginPage.tsx`): Email + password form.
- **Users page** (`client/src/pages/admin/UsersPage.tsx`): Admin user management with create/edit/delete dialogs.

## Token Flow

1. **Login**: `POST /api/auth/login` with `{ email, password }` returns `{ accessToken, user }` + sets `refresh_token` httpOnly cookie
2. **API calls**: `Authorization: Bearer <accessToken>` header on every request
3. **Token expiry**: On 401, client calls `POST /api/auth/refresh` (cookie sent automatically), gets new access token, retries original request
4. **Logout**: `POST /api/auth/logout` revokes refresh token in DB, clears cookie, clears in-memory access token

## Cookie Configuration

- `httpOnly: true` — not accessible from JavaScript
- `secure: true` — only in production (HTTPS)
- `sameSite: 'none'` in production (required for cross-origin cookie sending on Render.com where frontend and backend are on separate origins); `'lax'` in development
- `path: /api/auth` — only sent to auth endpoints
- `maxAge: 24 hours`

## Environment Variables

- `JWT_SECRET` — Required. Random string (32+ chars) for signing JWTs. Verification is restricted to HS256 algorithm only.
- `PUBLIC_API_KEY` — Optional. Static key for public API consumers (mobile apps, external services). Does **not** grant admin access.
- `CLIENT_IP_FROM_RIGHT` — Optional, default `2`. How many entries from the RIGHT of `X-Forwarded-For` to count to reach the reader (see below). `0` turns it off and `req.ip` goes back to Express's value.

## Rate limits count per reader

Every limiter keys on `req.ip`. Behind the Static Web Apps proxy, Express's `req.ip` (`trust proxy: 1`) is the proxy's egress, not the reader: measured in production on 2026-10-11 against `/api/health`, `RateLimit-Remaining` for one connection on one instance went 97, 98, 98, 97, 99, so the key changed from request to request and no budget belonged to any reader.

`server/src/middleware/clientIp.ts` (first in `app.ts`) sets `req.ip` to the reader. `X-Forwarded-For` arrives as `reader[:port], proxy-egress`; what a caller writes sits on the LEFT, so the entry is counted **from the right** (`CLIENT_IP_FROM_RIGHT`) and a forged prefix cannot move it. The port is stripped and IPv6 is grouped by /64. If the chain does not have the expected shape it falls back to Express's value: the worst case is the old behavior, never a free budget.

**How to check it in production:** `RateLimit-Remaining` on `GET /api/health` must drop by exactly one per request for the same reader, whatever the connection, and must not change when you add a leading `X-Forwarded-For` value. If it still jumps, the chain has more entries than assumed: the first requests of each process log the SHAPE of the header (entry count, `v4`/`v4:port`, never an address) under `client-ip`; raise `CLIENT_IP_FROM_RIGHT` to the count that puts the reader in position.

## Database Models

- `User` (`users` table): id, email, name, passwordHash, role (admin/editor/viewer), timestamps
- `RefreshToken` (`refresh_tokens` table): id, token, userId, familyId, expiresAt, rotatedAt, createdAt. Cascade-deleted with user. `familyId` groups tokens from the same login session; `rotatedAt` marks soft-rotated tokens for reuse detection. Expired tokens are automatically cleaned up hourly via `cleanupExpiredTokens()` in `server/src/index.ts`.

## Roles

- `admin` — Full access, can manage users
- `editor` — Future use
- `viewer` — Future use (default for new users)

## Creating the First Admin

```bash
npx tsx server/src/scripts/create-admin.ts
```

## Key Files

- Server auth: `server/src/services/auth.ts`, `server/src/middleware/auth.ts`, `server/src/routes/auth.ts`
- Server users: `server/src/services/user.ts`, `server/src/routes/admin/users.ts`
- Schemas: `server/src/schemas/auth.ts`, `server/src/schemas/user.ts`
- Client auth: `client/src/lib/auth.tsx`, `client/src/lib/admin-api.ts`
- Client UI: `client/src/pages/admin/LoginPage.tsx`, `client/src/pages/admin/UsersPage.tsx`
- Hooks: `client/src/hooks/useUsers.ts`
