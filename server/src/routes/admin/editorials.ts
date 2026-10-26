import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import * as editorialService from '../../services/editorial.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { expensiveOpLimiter } from '../../middleware/rateLimit.js'
import {
  createEditorialSchema,
  updateEditorialSchema,
  editorialQuerySchema,
} from '../../schemas/editorial.js'

const router = Router()
const log = createLogger('editorials')

router.get('/', validateQuery(editorialQuerySchema), async (req, res) => {
  try {
    const filters = req.parsedQuery || {}
    const result = await editorialService.getEditorials(filters)
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to fetch editorials')
    res.status(500).json({ error: 'Failed to fetch editorials' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const editorial = await editorialService.getEditorialById(req.params.id)
    if (!editorial) {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    res.json(editorial)
  } catch (err) {
    log.error({ err }, 'failed to fetch editorial')
    res.status(500).json({ error: 'Failed to fetch editorial' })
  }
})

router.post('/', validateBody(createEditorialSchema), async (req, res) => {
  try {
    const editorial = await editorialService.createEditorial(req.body)
    res.status(201).json(editorial)
  } catch (err) {
    log.error({ err }, 'failed to create editorial')
    res.status(500).json({ error: 'Failed to create editorial' })
  }
})

router.put('/:id', validateBody(updateEditorialSchema), async (req, res) => {
  try {
    const editorial = await editorialService.updateEditorial(req.params.id, req.body)
    res.json(editorial)
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    log.error({ err }, 'failed to update editorial')
    res.status(500).json({ error: 'Failed to update editorial' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await editorialService.deleteEditorial(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    log.error({ err }, 'failed to delete editorial')
    res.status(500).json({ error: 'Failed to delete editorial' })
  }
})

// B5 (25-oct-2026): el borrador sale de las notas del director. Sin notas
// suficientes el servicio se niega y dice por qué (422, mensaje para el panel).
router.post('/:id/generate', expensiveOpLimiter, async (req, res) => {
  try {
    const editorial = await editorialService.generateEditorialContent(req.params.id)
    res.json(editorial)
  } catch (err: any) {
    if (err.message === 'Editorial not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err instanceof editorialService.EditorialError) {
      res.status(422).json({ error: err.message, avisos: err.avisos })
      return
    }
    log.error({ err }, 'failed to generate editorial content')
    res.status(500).json({ error: 'Failed to generate editorial content' })
  }
})

// Sin firma ni método no se publica, y un candado bloqueante tampoco deja.
router.post('/:id/publish', async (req, res) => {
  try {
    const editorial = await editorialService.publishEditorial(req.params.id)
    res.json(editorial)
  } catch (err: any) {
    if (err.code === 'P2025' || err.message === 'Editorial not found') {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    if (err instanceof editorialService.EditorialError) {
      res.status(422).json({ error: err.message })
      return
    }
    log.error({ err }, 'failed to publish editorial')
    res.status(500).json({ error: 'Failed to publish editorial' })
  }
})

router.post('/:id/unpublish', async (req, res) => {
  try {
    const editorial = await editorialService.unpublishEditorial(req.params.id)
    res.json(editorial)
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    log.error({ err }, 'failed to unpublish editorial')
    res.status(500).json({ error: 'Failed to unpublish editorial' })
  }
})

router.get('/:id/linkedin', async (req, res) => {
  try {
    const editorial = await editorialService.getEditorialById(req.params.id)
    if (!editorial) {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    if (!editorial.content) {
      res.status(400).json({ error: 'Editorial has no content yet' })
      return
    }
    const text = editorialService.formatForLinkedIn(editorial)
    res.json({ text })
  } catch (err) {
    log.error({ err }, 'failed to format editorial for linkedin')
    res.status(500).json({ error: 'Failed to format for LinkedIn' })
  }
})

export default router
