import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import prisma from '../../lib/prisma.js'
import { writeAuditLog } from '../../services/audit.js'
import { getReviewMode } from '../../lib/communityVisibility.js'
import { reconcileCommunityReviews } from '../../services/communityReview.js'

const router = Router()
const log = createLogger('admin:communities')

/**
 * GET /api/admin/communities
 * Lists all communities (active and inactive) with member counts.
 */
router.get('/', async (_req, res) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { members: true } },
      },
    })
    res.json(communities)
  } catch (err) {
    log.error({ err }, 'failed to list communities')
    res.status(500).json({ error: 'Failed to list communities' })
  }
})

/** Palabras clave: 1 a 40, cada una de 2 a 60 caracteres, sin duplicados (ignorando mayusculas). */
function parseKeywords(raw: unknown): { ok: true; keywords: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'keywords debe ser una lista' }
  const limpias: string[] = []
  const vistas = new Set<string>()
  for (const k of raw) {
    if (typeof k !== 'string') return { ok: false, error: 'cada palabra clave debe ser texto' }
    const t = k.trim()
    if (t.length < 2 || t.length > 60) return { ok: false, error: `palabra clave fuera de rango (2-60): "${t}"` }
    const clave = t.toLowerCase()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    limpias.push(t)
  }
  if (limpias.length === 0 || limpias.length > 40) return { ok: false, error: 'entre 1 y 40 palabras clave' }
  return { ok: true, keywords: limpias }
}

/**
 * PATCH /api/admin/communities/:id
 * Body: { active?: boolean, lat?, lng?, keywords?: string[] }
 *
 * Las palabras clave deciden que notas pertenecen a la vertical (D4, Tanda B,
 * item 15): hasta el 4-oct-2026 solo se cambiaban por SQL, sin rastro. Ahora
 * quedan en audit_log con antes y despues, y si la vertical esta en revision
 * se corre el conciliador para que la cola refleje la pertenencia nueva.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { active, lat, lng } = req.body as { active?: boolean; lat?: number | null; lng?: number | null; keywords?: unknown }

    const data: Record<string, unknown> = {}

    if (typeof active === 'boolean') data.active = active
    if ('lat' in req.body) data.lat = lat ?? null
    if ('lng' in req.body) data.lng = lng ?? null
    if ('keywords' in req.body) {
      const parsed = parseKeywords(req.body.keywords)
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error })
        return
      }
      data.keywords = parsed.keywords
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' })
      return
    }

    const antes = 'keywords' in data
      ? await prisma.community.findUnique({ where: { id }, select: { slug: true, keywords: true } })
      : null

    const community = await prisma.community.update({ where: { id }, data })

    if ('keywords' in data) {
      await writeAuditLog({
        actor: req.user,
        action: 'community.keywords',
        targetType: 'community',
        targetId: id,
        metadata: { slug: community.slug, from: antes?.keywords ?? [], to: data.keywords },
      })
      if ((await getReviewMode(id)) !== 'off') {
        // La pertenencia cambio: la cola se concilia ya, sin esperar la hora del job.
        reconcileCommunityReviews({ slugs: [community.slug], force: true }).catch((err) =>
          log.error({ err, slug: community.slug }, 'reconcile after keywords change failed'),
        )
      }
    }

    log.info({ id, ...data }, 'community updated')
    res.json(community)
  } catch (err) {
    log.error({ err }, 'failed to update community')
    res.status(500).json({ error: 'Failed to update community' })
  }
})

export default router
