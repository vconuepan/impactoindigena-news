import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { getEditorials, getEditorialById, toPublicEditorial } from '../../services/editorial.js'

const router = Router()
const log = createLogger('public-editorials')

// Las editoriales publicadas, con firma, método y fuentes. Las notas del
// director (`notes`) nunca salen por acá: `toPublicEditorial` las deja fuera.
router.get('/', async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string) : 1
    const pageSize = Math.min(req.query.pageSize ? parseInt(req.query.pageSize as string) : 10, 50)
    const result = await getEditorials({ status: 'published', page, pageSize })
    res.json({ ...result, data: result.data.map((e) => toPublicEditorial(e as unknown as Record<string, unknown>)) })
  } catch (err) {
    log.error({ err }, 'failed to fetch public editorials')
    res.status(500).json({ error: 'Failed to fetch editorials' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const editorial = await getEditorialById(req.params.id)
    if (!editorial || editorial.status !== 'published') {
      res.status(404).json({ error: 'Editorial not found' })
      return
    }
    res.json(toPublicEditorial(editorial as unknown as Record<string, unknown>))
  } catch (err) {
    log.error({ err }, 'failed to fetch public editorial')
    res.status(500).json({ error: 'Failed to fetch editorial' })
  }
})

export default router
