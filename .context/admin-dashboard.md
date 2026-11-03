# Admin Dashboard

The admin dashboard is a React SPA at `/admin/*` with 9 pages, JWT-based auth with httpOnly refresh cookies, and TanStack Query for data fetching.

## Architecture

- **Auth**: `AuthProvider` wraps the app; stores JWT access token in memory (not localStorage), uses httpOnly cookie for session refresh, redirects to `/admin/login` on auth failure. See `.context/authentication.md` for details.
- **API Client**: `admin-api.ts` provides typed `adminApi.*` methods organized by resource with Bearer auth headers. Auto-refreshes expired tokens via `/api/auth/refresh`.
- **Data Fetching**: TanStack Query with 30s stale time, hooks in `hooks/use*.ts` per resource
- **UI Components**: Headless UI + Tailwind in `components/ui/` (Button, Badge, Card, Pagination, etc.)
- **Admin Components**: Resource-specific in `components/admin/` (tables, forms, detail views)
- **Toast Notifications**: `ToastProvider` in AdminLayout, `useToast()` hook for success/error/progress messages
- **Background Tasks**: `BackgroundTaskProvider` in AdminLayout, `useBackgroundTasks()` hook for fire-and-forget async operations with progress tracking via persistent toasts

## Route Structure

```
/admin/login          → LoginPage (no auth)
/admin                → AdminLayout (auth required)
  /admin              → DashboardPage (stats + jobs health)
  /admin/stories      → StoriesPage (filters, table, bulk actions)
  /admin/stories/:id  → StoryDetailPage
  /admin/feeds        → FeedsPage
  /admin/issues       → IssuesPage
  /admin/issues/new   → IssueEditPage
  /admin/issues/:id/edit → IssueEditPage
  /admin/newsletters  → NewslettersPage
  /admin/newsletters/:id → NewsletterDetailPage
  /admin/podcasts     → PodcastsPage
  /admin/podcasts/:id → PodcastDetailPage
  /admin/jobs         → JobsPage (auto-refreshes every 10s)
  /admin/users        → UsersPage (admin-only user management)
```

## Key Patterns

- **Story filters** persist in URL search params via `useSearchParams()`. «Nota con claves» (`bodyMethod`) lists the bodies waiting for review, which the public page hides (decision C7, 2026-11-03; see `story-pipeline.md`)
- **Bulk actions** use selection state (resets on filter/page change) with confirmation dialogs
- **Bulk LLM operations** (preassess, assess, select) run as background tasks via `useBackgroundTasks()` — dialog closes immediately, progress toasts persist across navigation, query invalidation fires on completion
- **LLM operations** (newsletter/podcast generation) show persistent loading state with "may take a minute" message
- **Carousel ZIP download** uses `response.blob()` + `URL.createObjectURL` + auto-click download
- **Cron editing** is inline in the jobs table with save/cancel
- **Issue slug** auto-generates from name in create mode
- **Issue hierarchy** supports one level of nesting (parent/child). Issues table shows children indented under parents. Edit form has optional parent selector and static content editors (evaluation criteria, sources, make-a-difference links). Feed selector shows hierarchical issue dropdown.

## File Locations

- API client: `client/src/lib/admin-api.ts`
- Auth: `client/src/lib/auth.tsx`
- Query config: `client/src/lib/query.ts`
- Constants/formatting: `client/src/lib/constants.ts`
- Hooks: `client/src/hooks/use*.ts`
- UI components: `client/src/components/ui/*.tsx`
- Admin components: `client/src/components/admin/*.tsx`
- Pages: `client/src/pages/admin/*.tsx`
- Layout: `client/src/layouts/AdminLayout.tsx`
