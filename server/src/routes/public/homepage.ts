import { Router } from 'express'
import * as storyService from '../../services/story.js'
import * as issueService from '../../services/issue.js'
import prisma from '../../lib/prisma.js'
import { TTLCache, cached } from '../../lib/cache.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:homepage')

// Cache homepage data for 1 minute
const HOMEPAGE_TTL = 60 * 1000
const homepageCache = new TTLCache<unknown>(HOMEPAGE_TTL)

/**
 * Las ocho categorias tematicas, en el orden en que se muestran.
 *
 * Esta lista existe TRES veces -aqui, en `client/src/lib/issue-order.ts` y,
 * hasta hoy, dentro de HomePage- porque el server no resuelve el alias
 * `@shared` y darselo obliga a tocar su build. Duplicarla es el mal menor;
 * dejarla desincronizada, no: el 5-sep-2026 esta se quedo con las cinco viejas
 * y con el slug legado de Economias, asi que la portada pedia historias para
 * cinco secciones y las cuatro nuevas -Territorio, Consulta, Defensores y
 * Mujeres, con 1.180 historias entre ellas- llegaban vacias al cliente.
 *
 * `homepage.test.ts` lee el archivo del cliente y falla si dejan de coincidir.
 * Chile no esta: es una seccion geografica y vive en la barra de verticales.
 */
export const HOMEPAGE_ISSUE_SLUGS = [
  'territorio-y-tierras',
  'cambio-climatico',
  'consulta-y-consentimiento',
  'economias-indigenas',
  'derechos-indigenas',
  'defensores-y-proteccion',
  'mujeres-indigenas',
  'cultura-y-conocimientos-ancestrales',
]

/**
 * Arma la respuesta de la portada.
 *
 * Vive aparte de la ruta porque la publica DOS consumidores: este endpoint y el
 * snapshot que se sube a R2 (`lib/homepage-snapshot.ts`). Si cada uno la
 * construyera por su lado, el dia que se agregue un campo aqui el snapshot
 * seguiria sirviendo el viejo y nadie se enteraria.
 */
export async function buildHomepagePayload() {
  const [issues, storyData, activeCases] = await Promise.all([
    issueService.getPublicIssues(),
    storyService.getHomepageData(HOMEPAGE_ISSUE_SLUGS, 7),
    prisma.ongoingCase.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, slug: true, description: true, imageUrl: true, keywords: true },
    }),
  ])

  // Count matching stories for each case
  const casesWithCounts = await Promise.all(
    activeCases.map(async (c) => {
      const keywordConditions = c.keywords.flatMap((kw) => [
        { title:   { contains: kw, mode: 'insensitive' as const } },
        { summary: { contains: kw, mode: 'insensitive' as const } },
      ])
      const storyCount = c.keywords.length === 0 ? 0 : await prisma.story.count({
        where: { status: 'published', slug: { not: null }, OR: keywordConditions },
      })
      return { ...c, storyCount }
    })
  )

  return {
    issues,
    storiesByIssue: storyData.storiesByIssue,
    activeCases: casesWithCounts,
  }
}

router.get('/', async (req, res) => {
  try {
    const data = await cached(homepageCache, 'homepage-data', buildHomepagePayload)

    res.set('Cache-Control', 'public, max-age=60')
    res.json(data)
  } catch (err) {
    log.error({ err }, 'failed to fetch homepage data')
    res.status(500).json({ error: 'Failed to fetch homepage data' })
  }
})

export default router
