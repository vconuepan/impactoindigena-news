# UI Conventions

Standards and patterns for building public and admin pages.

## SEO Checklist

Each page should:

- [ ] Use Helmet with title, description
- [ ] Have unique, descriptive title
- [ ] Have unique meta description (150-160 chars)
- [ ] Be listed in `client/src/routes.ts` for prerendering
- [ ] No hardcoded counts (source count, story count, language count) -- use `useSources()` hook or omit. These values change as feeds are added/removed.

## CSS Utility Classes

Defined in `client/src/index.css`:

**Layout:**

- `.page-section` -- Standard page wrapper (max-w-3xl, responsive padding)
- `.page-section-wide` -- Wider page wrapper (max-w-4xl)

**Typography:**

- `.page-title` -- Page headings (text-4xl/5xl, bold, centered)
- `.page-intro` -- Subtitle text below page title
- `.prose` -- Body text container (text-neutral-600, relaxed leading, auto-styled links)
- `.section-heading` -- Section headings (text-2xl)
- `.section-heading-lg` -- Larger section headings (text-3xl)

## Bundle Splitting

The client uses `React.lazy()` to split code and reduce initial bundle size. Homepage visitors only download homepage code; other pages load on demand.

**Rules:**

- **HomePage** (`client/src/pages/HomePage.tsx`): Static import in `App.tsx` -- this is the critical landing page
- **Other public pages** (`client/src/pages/*.tsx`): Use **`React.lazy()`** in `App.tsx` -- prerendering still works (Puppeteer waits for chunks)
- **Admin pages** (`client/src/pages/admin/*.tsx`): Use **`React.lazy()`** in `App.tsx`. Must use `export default` (not named exports).
- **Admin-only npm packages** (`@headlessui/react`, `@heroicons/react`): Automatically code-split via lazy loading.
- **Error boundary:** `ChunkErrorBoundary` and `LazyPage` wrapper handle chunk load failures with reload button.
- **Preloading:** `LoginPage` calls `preloadAdminChunks()` on mount.

## Accessibility (WCAG 2.2 AA)

See `.context/accessibility.md` for full WCAG patterns, ARIA, and testing checklist.

**Common requirements:**

- **Links/buttons**: `focus-visible:ring-2 focus-visible:ring-brand-500`
- **Link color**: Use `text-brand-700` (not brand-600) for AA contrast
- **Images**: Always include `alt` text (use `alt=""` for decorative)
- **Forms**: Every input needs a `<label>` with matching `htmlFor`/`id`
- **Touch targets**: Minimum 24x24px

## Spelling & Language

All hardcoded static text (UI labels, headings, descriptions, error messages, tooltips, meta tags) must use **American English** spelling. Examples: "analyzed" (not "analysed"), "color" (not "colour"), "organize" (not "organise"). Proper nouns that use British spelling (e.g. organization names like "Centre for...") are exempt.

Use em dashes sparingly in user-facing copy. One per paragraph at most. Overuse is a tell for AI-generated text. Prefer commas, periods, or rewriting the sentence instead.

## Security Headers (`staticwebapp.config.json`)

The frontend's headers live in `globalHeaders` in `client/public/staticwebapp.config.json`. The backend has its own set via helmet in `server/src/app.ts` — those only cover API responses, so the HTML needs its own.

**The CSP is calibrated against what the page actually loads.** Verified before setting it, and worth re-verifying if you add a third-party script, embed, or font host:

| Directive | Why |
|-----------|-----|
| `script-src 'self'` | The HTML has **no inline scripts** — everything is a bundled file under `/assets/`. Adding an inline script breaks the page unless you add a hash or nonce. |
| `style-src 'self' 'unsafe-inline'` | React and Tailwind emit `style=` attributes, which CSP counts as inline. |
| `img-src 'self' data: https:` | Story images come from R2 **and** from arbitrary source domains (crawled og:image), so this has to stay broad. |
| `font-src 'self'` | Fonts are self-hosted under `/fonts/` — no Google Fonts. |
| `connect-src 'self'` | `VITE_API_URL` is empty in production; the client calls `/api/*` on the same origin through the SWA proxy. **If the API ever moves to its own hostname, this must list it or every request breaks.** |
| `frame-src 'none'` | No iframes or embeds anywhere. Revisit if a podcast player gets embedded. |

`X-XSS-Protection: 0` is deliberate. The header is deprecated, and its filter can introduce vulnerabilities in old browsers; OWASP recommends disabling it and relying on CSP.

**Open redirect guard:** any navigation target coming from the URL must pass through `safeInternalPath()` (`client/src/lib/safePath.ts`) before reaching `<Link to>` or `navigate()`. React Router 6/7 carries an open-redirect bug via backslash (GHSA-wrjc-x8rr-h8h6) whose patch only exists in 7.x, so the guard is what actually protects the app while the project stays on v6. It matters most on auth pages: the link comes from the real domain, so the visitor trusts it before landing on the attacker's page.
