import { Router } from 'express'
import prisma from '../../lib/prisma.js'
import { createLogger } from '../../lib/logger.js'

const router = Router()
const log = createLogger('public:stats')

// Ventana movil de 24 h, no dia calendario UTC.
//
// `publish_stories` corre una vez al dia a las 11:00 UTC. Con un corte por dia
// calendario, el contador de seleccionadas quedaba en 0 desde medianoche hasta
// las 11:00 UTC — de 20:00 a 07:00 en Chile, es decir toda la franja de lectura
// vespertina. La barra de curaduria es la prueba publica de que el sistema
// selecciona; anunciaba "0 seleccionados" 11 de cada 24 horas.
//
// La ventana movil siempre alcanza la ultima tanda publicada, asi que un 0 aqui
// significa que de verdad no se publico nada en 24 h — una senal real, no un
// artefacto del huso horario.
const WINDOW_HOURS = 24

router.get('/daily', async (_req, res) => {
  try {
    const now = new Date()
    const windowStart = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000)

    const [crawled24h, published24h, activeFeeds] = await Promise.all([
      prisma.story.count({
        where: { dateCrawled: { gte: windowStart } },
      }),
      prisma.story.count({
        where: {
          status: 'published',
          datePublished: { gte: windowStart },
        },
      }),
      prisma.feed.count({ where: { active: true } }),
    ])

    res.set('Cache-Control', 'public, max-age=120')
    res.json({ crawled24h, published24h, activeFeeds, updatedAt: now.toISOString() })
  } catch (err) {
    log.error({ err }, 'failed to fetch daily stats')
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
