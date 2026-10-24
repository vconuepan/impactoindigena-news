import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { validateBody } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import {
  draftStoryCarousel,
  renderStoryCarouselImages,
  buildStoryCarouselZip,
  StoryCarouselError,
  StoryNotFoundError,
} from '../../services/storyCarousel.js'
import { draftStoryCarouselBodySchema, renderStoryCarouselBodySchema } from '../../schemas/storyCarousel.js'

/**
 * Carrusel de una noticia (`/api/admin/stories/:id/carousel…`). Ninguna de las
 * tres rutas escribe en la base ni publica nada: el texto vuelve al panel, y
 * las láminas vuelven como vista previa o como descarga.
 */
const router = Router()
const log = createLogger('story-carousel-routes')

function responderError(res: any, err: unknown, accion: string) {
  if (err instanceof StoryNotFoundError) {
    res.status(404).json({ error: err.message })
    return
  }
  if (err instanceof StoryCarouselError) {
    res.status(422).json({ error: err.message, avisos: err.avisos })
    return
  }
  log.error({ err }, `failed to ${accion}`)
  res.status(500).json({ error: 'No se pudo armar el carrusel' })
}

// Paso 1: el texto de las láminas, desde el artículo original. Llama al modelo.
router.post('/:id/carousel', expensiveOpLimiter, validateBody(draftStoryCarouselBodySchema), async (req, res) => {
  try {
    const draft = await draftStoryCarousel(req.params.id, req.body.conLectura)
    res.json(draft)
  } catch (err) {
    responderError(res, err, 'draft story carousel')
  }
})

// Paso 2a: vista previa. Devuelve las láminas como data URLs y los avisos.
router.post('/:id/carousel/preview', validateBody(renderStoryCarouselBodySchema), async (req, res) => {
  try {
    const { imagenes, avisos } = await renderStoryCarouselImages(req.params.id, req.body)
    res.json({
      imagenes: imagenes.map((b) => `data:image/jpeg;base64,${b.toString('base64')}`),
      avisos,
    })
  } catch (err) {
    responderError(res, err, 'preview story carousel')
  }
})

// Paso 2b: descarga. Un ZIP con una imagen por lámina y el PDF; 422 si hay avisos.
router.post('/:id/carousel/download', validateBody(renderStoryCarouselBodySchema), async (req, res) => {
  try {
    const { zip, nombre } = await buildStoryCarouselZip(req.params.id, req.body)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${nombre.replace(/[^a-zA-Z0-9-]/g, '-')}.zip"`)
    res.send(zip)
  } catch (err) {
    responderError(res, err, 'download story carousel')
  }
})

export default router
