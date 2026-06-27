import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import { validateQuery, validateBody } from '../../middleware/validate.js'
import { adminAgendaQuerySchema, updateAgendaItemSchema } from '../../schemas/agenda.js'
import { listAgendaItems, updateAgendaItem, deleteAgendaItem, AgendaValidationError } from '../../services/agenda.js'
import { runIngestAgenda } from '../../jobs/ingestAgenda.js'

const router = Router()
const log = createLogger('admin:agenda')

// GET /api/admin/agenda?status=&type=&page=&pageSize= — list (drafts first)
router.get('/', validateQuery(adminAgendaQuerySchema), async (req, res) => {
  try {
    const result = await listAgendaItems(req.parsedQuery as Parameters<typeof listAgendaItems>[0])
    res.json(result)
  } catch (err) {
    log.error({ err }, 'failed to list agenda items')
    res.status(500).json({ error: 'Failed to list agenda items' })
  }
})

// PUT /api/admin/agenda/:id — edit fields / publish a draft
router.put('/:id', validateBody(updateAgendaItemSchema), async (req, res) => {
  try {
    const item = await updateAgendaItem(req.params.id, req.body)
    res.json(item)
  } catch (err: unknown) {
    if (err instanceof AgendaValidationError) {
      res.status(400).json({ error: err.message })
      return
    }
    if ((err as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Agenda item not found' })
      return
    }
    log.error({ err }, 'failed to update agenda item')
    res.status(500).json({ error: 'Failed to update agenda item' })
  }
})

// DELETE /api/admin/agenda/:id
router.delete('/:id', async (req, res) => {
  try {
    await deleteAgendaItem(req.params.id)
    res.status(204).send()
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Agenda item not found' })
      return
    }
    log.error({ err }, 'failed to delete agenda item')
    res.status(500).json({ error: 'Failed to delete agenda item' })
  }
})

// POST /api/admin/agenda/ingest — trigger ingestion now (background)
router.post('/ingest', (_req, res) => {
  runIngestAgenda().catch((err) => log.error({ err }, 'manual agenda ingest failed'))
  res.json({ message: 'Agenda ingest triggered' })
})

export default router
