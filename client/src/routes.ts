/**
 * All routes with sitemap metadata.
 * Used by React Router, prerenderer, and sitemap generation.
 *
 * When adding a new page:
 * 1. Add route config here (path, priority, changefreq)
 * 2. Create page component in src/pages/
 * 3. Add route in App.tsx
 * 4. Rebuild to generate static HTML and updated sitemap
 */

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export interface RouteConfig {
  path: string
  priority: number
  changefreq: ChangeFreq
}

export const routes: RouteConfig[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/issues', priority: 0.8, changefreq: 'monthly' },
  { path: '/comunidades', priority: 0.8, changefreq: 'weekly' },
  { path: '/methodology', priority: 0.7, changefreq: 'monthly' },
  { path: '/about', priority: 0.7, changefreq: 'monthly' },
  { path: '/newsletter', priority: 0.6, changefreq: 'monthly' },
  { path: '/feedback', priority: 0.5, changefreq: 'monthly' },
  { path: '/imprint', priority: 0.5, changefreq: 'yearly' },
  { path: '/privacy', priority: 0.5, changefreq: 'yearly' },
  { path: '/terminos', priority: 0.5, changefreq: 'yearly' },
  { path: '/cookies', priority: 0.5, changefreq: 'yearly' },
  { path: '/search', priority: 0.3, changefreq: 'daily' },
  { path: '/saved', priority: 0.3, changefreq: 'daily' },
  { path: '/subscribed', priority: 0.2, changefreq: 'yearly' },
  { path: '/thank-you', priority: 0.2, changefreq: 'yearly' },
  // Evergreen reference pages
  { path: '/mapa', priority: 0.8, changefreq: 'monthly' },
  { path: '/glosario', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/pueblo-mapuche', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/consulta-previa-fpic', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/pueblos-indigenas-chile', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/c169-pais-por-pais', priority: 0.8, changefreq: 'yearly' },
  { path: '/guia/jurisprudencia-interamericana', priority: 0.8, changefreq: 'monthly' },
  { path: '/guia/declaracion-onu-undrip', priority: 0.8, changefreq: 'yearly' },
  // Voces Indígenas editorial
  { path: '/voces-indigenas', priority: 0.9, changefreq: 'weekly' },
  // Dynamic routes (issues, communities, stories) added at build time
  // by vite.config.ts (prerender) and scripts/generate-sitemap.ts
]

export const routePaths = routes.map((r) => r.path)

export type Route = (typeof routePaths)[number]
