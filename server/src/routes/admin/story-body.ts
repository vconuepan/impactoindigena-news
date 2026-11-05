import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { validateBody } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import { draftStoryBody, getStoryBody, getVerificacionCuerpo, updateStoryBody, StoryBodyError } from '../../services/storyBody.js'
import { updateStoryBodySchema } from '../../schemas/storyBody.js'

/**
 * La nota con claves desde el panel (`/api/admin/stories/:id/body`).
 * GET la lee · POST la redacta de nuevo desde el artículo original (llama al
 * modelo; si un candado bloquea, no escribe y devuelve los avisos) · PUT
 * guarda correcciones del editor o la marca como revisada.
 */
const router = Router()
const log = createLogger('story-body-routes')

router.get('/:id/body', async (req, res) => {
  try {
    const body = await getStoryBody(req.params.id)
    res.json({ body })
  } catch (err) {
    log.error({ err }, 'failed to read story body')
    res.status(500).json({ error: 'No se pudo leer la nota con claves' })
  }
})

/** Cada cifra y nombre de la nota con la frase del original donde aparece, y el original. */
router.get('/:id/body/verificacion', async (req, res) => {
  try {
    const verificacion = await getVerificacionCuerpo(req.params.id)
    if (!verificacion) {
      res.status(404).json({ error: 'Esta noticia no tiene nota con claves' })
      return
    }
    res.json(verificacion)
  } catch (err) {
    log.error({ err }, 'failed to build story body verification')
    res.status(500).json({ error: 'No se pudo armar la verificación' })
  }
})

router.post('/:id/body', expensiveOpLimiter, async (req, res) => {
  try {
    const resultado = await draftStoryBody(req.params.id)
    if (resultado.outcome === 'failed' && resultado.reason === 'Story not found') {
      res.status(404).json({ error: 'Story not found' })
      return
    }
    if (resultado.outcome === 'blocked') {
      res.status(422).json({ error: 'Los candados bloquearon el cuerpo: no se guardó.', avisos: resultado.avisos })
      return
    }
    if (resultado.outcome === 'skipped' || resultado.outcome === 'failed') {
      res.status(422).json({ error: `No se redactó: ${resultado.reason}` })
      return
    }
    const body = await getStoryBody(req.params.id)
    res.json({ body, avisos: resultado.avisos })
  } catch (err) {
    log.error({ err }, 'failed to draft story body')
    res.status(500).json({ error: 'No se pudo redactar la nota con claves' })
  }
})

router.put('/:id/body', validateBody(updateStoryBodySchema), async (req, res) => {
  try {
    const { avisos } = await updateStoryBody(req.params.id, req.body)
    const body = await getStoryBody(req.params.id)
    res.json({ body, avisos })
  } catch (err) {
    if (err instanceof StoryBodyError) {
      res.status(422).json({ error: err.message, avisos: err.avisos })
      return
    }
    log.error({ err }, 'failed to update story body')
    res.status(500).json({ error: 'No se pudo guardar la nota con claves' })
  }
})

export default router
