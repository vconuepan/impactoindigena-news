/**
 * Generates sitemap.xml from routes.ts + published story slugs from the API.
 *
 * Run manually: npm run sitemap:generate
 *
 * NO corre en el build: `npm run build` es `tsc -b && vite build`, y el
 * sitemap que sirve el sitio lo emite el servidor en /sitemap.xml con
 * `config.siteUrl`. Este script escribe client/public/sitemap.xml, que hoy no
 * existe; si alguien lo corre, ese archivo pasa a competir con la ruta del
 * servidor. Por eso lee el dominio de la configuracion y no uno escrito a
 * mano: hasta el 17-sep-2026 tenia `impactoindigena.news` fijo, que lleva
 * meses siendo solo una redireccion.
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { routes, type RouteConfig } from '../src/routes.js'
import { generateSitemapXml } from '../src/lib/sitemap.js'
import { SITE_URL } from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = SITE_URL
const API_URL = process.env.VITE_API_URL || 'http://localhost:3001'

interface PaginatedResponse {
  data: { slug: string }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

async function fetchStorySlugs(): Promise<string[]> {
  const slugs: string[] = []
  let page = 1
  const pageSize = 100

  try {
    while (true) {
      const res = await fetch(`${API_URL}/api/stories?page=${page}&pageSize=${pageSize}`)
      if (!res.ok) throw new Error(`API returned ${res.status}`)

      const data: PaginatedResponse = await res.json()
      for (const story of data.data) {
        if (story.slug) slugs.push(story.slug)
      }

      if (page >= data.totalPages) break
      page++
    }
  } catch (err) {
    console.warn(`Could not fetch story slugs from API (${API_URL}): ${err instanceof Error ? err.message : err}`)
    return []
  }

  return slugs
}

async function fetchIssueSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/api/issues`)
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const issues: { slug: string }[] = await res.json()
    return issues.map((i) => i.slug)
  } catch (err) {
    console.warn(`Could not fetch issue slugs from API: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

async function fetchCommunitySlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/api/communities`)
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const communities: { slug: string }[] = await res.json()
    return communities.map((c) => c.slug)
  } catch (err) {
    console.warn(`Could not fetch community slugs from API: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

async function main() {
  const [storySlugs, issueSlugs, communitySlugs] = await Promise.all([
    fetchStorySlugs(),
    fetchIssueSlugs(),
    fetchCommunitySlugs(),
  ])

  const issueRoutes: RouteConfig[] = issueSlugs.map((slug) => ({
    path: `/issues/${slug}`,
    priority: 0.7,
    changefreq: 'weekly' as const,
  }))

  const communityRoutes: RouteConfig[] = communitySlugs.map((slug) => ({
    path: `/comunidad/${slug}`,
    priority: 0.7,
    changefreq: 'daily' as const,
  }))

  const storyRoutes: RouteConfig[] = storySlugs.map((slug) => ({
    path: `/stories/${slug}`,
    priority: 0.6,
    changefreq: 'monthly' as const,
  }))

  const allRoutes = [...routes, ...issueRoutes, ...communityRoutes, ...storyRoutes]
  const sitemap = generateSitemapXml(allRoutes, BASE_URL)
  const outputPath = resolve(__dirname, '../public/sitemap.xml')

  writeFileSync(outputPath, sitemap, 'utf-8')
  console.log(
    `Generated sitemap.xml with ${allRoutes.length} URLs ` +
    `(${routes.length} static + ${issueRoutes.length} issues + ${communityRoutes.length} communities + ${storyRoutes.length} stories)`
  )
}

main()
