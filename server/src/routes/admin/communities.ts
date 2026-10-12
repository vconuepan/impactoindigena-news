import { Router } from 'express'
import { createLogger } from '../../lib/logger.js'
import prisma from '../../lib/prisma.js'
import { writeAuditLog } from '../../services/audit.js'
import { config } from '../../config.js'
import { getReviewMode, publicCommunityWhere, temasVivos } from '../../lib/communityVisibility.js'
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

const EJEMPLOS = 5
const EJEMPLOS_POR_PALABRA = 3
const NOTA = { id: true, slug: true, title: true, datePublished: true } as const
const MAS_RECIENTE_PRIMERO = { datePublished: 'desc' } as const

/**
 * POST /api/admin/communities/:id/keywords-preview
 * Body: { keywords: string[] }  (la lista propuesta, con la misma validacion que el PATCH)
 *
 * Mide el cambio ANTES de guardarlo, sin escribir nada. La pertenencia se coteja
 * por subcadena (`contains`) sobre titulo, resumen y titulo de la fuente, asi que
 * una palabra corta puede arrastrar notas ajenas: el 3-oct-2026 «cam» calzaba en
 * 92 notas publicadas y solo 6 eran sobre la CAM.
 *
 * Mide PERTENENCIA (publicada, relevancia 3 o mas, palabras clave), no
 * visibilidad: la retencion por vertical se decide aparte y nota por nota. Si
 * midiera con el modo, en `enforce` una nota que solo calza con la palabra nueva
 * no tendria fila de revision y contaria como si la palabra no trajera nada; la
 * fila se la crea el conciliador al guardar. Devuelve `mode` para que la
 * pantalla lo advierta.
 *
 * Entran y salen son diferencias de conjuntos de ids, con las dos listas leidas
 * en una misma transaccion (REPEATABLE READ): nunca dan negativo aunque el
 * pipeline publique entre medio, y no hace falta un `NOT` sobre la condicion,
 * que con titulo o resumen NULL perderia notas.
 */
router.post('/:id/keywords-preview', async (req, res) => {
  try {
    const parsed = parseKeywords(req.body?.keywords)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }

    const community = await prisma.community.findUnique({
      where: { id: req.params.id },
      select: { id: true, keywords: true, issueIds: true },
    })
    if (!community) {
      res.status(404).json({ error: 'Community not found' })
      return
    }

    const temas = await temasVivos()
    const mode = await getReviewMode(community.id)
    // Sin la exclusion del modo, a proposito (ver arriba).
    const pertenencia = (keywords: string[]) =>
      publicCommunityWhere({ community: { ...community, keywords }, temas, mode: 'off', learningMode: config.gate.learningMode })

    const [actualNotas, propuestaNotas] = await prisma.$transaction(
      [
        prisma.story.findMany({ where: pertenencia(community.keywords), select: NOTA, orderBy: MAS_RECIENTE_PRIMERO }),
        prisma.story.findMany({ where: pertenencia(parsed.keywords), select: NOTA, orderBy: MAS_RECIENTE_PRIMERO }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    const idsActual = new Set(actualNotas.map((n) => n.id))
    const idsPropuesta = new Set(propuestaNotas.map((n) => n.id))
    const entran = propuestaNotas.filter((n) => !idsActual.has(n.id))
    const salen = actualNotas.filter((n) => !idsPropuesta.has(n.id))

    const vigentes = new Set(community.keywords.map((k) => k.toLowerCase()))
    const nuevas = parsed.keywords.filter((k) => !vigentes.has(k.toLowerCase()))
    const propuestas = new Set(parsed.keywords.map((k) => k.toLowerCase()))
    const quitadas = community.keywords.filter((k) => !propuestas.has(k.toLowerCase()))

    const porPalabra = await Promise.all(
      nuevas.map(async (keyword) => {
        const where = pertenencia([keyword])
        const [notas, ejemplos] = await Promise.all([
          prisma.story.count({ where }),
          prisma.story.findMany({ where, select: NOTA, orderBy: MAS_RECIENTE_PRIMERO, take: EJEMPLOS_POR_PALABRA }),
        ])
        return { keyword, notas, ejemplos }
      }),
    )

    res.json({
      mode,
      actual: actualNotas.length,
      propuesta: propuestaNotas.length,
      entran: { total: entran.length, ejemplos: entran.slice(0, EJEMPLOS) },
      salen: { total: salen.length, ejemplos: salen.slice(0, EJEMPLOS) },
      nuevas: porPalabra,
      quitadas,
      keywords: parsed.keywords,
    })
  } catch (err) {
    log.error({ err }, 'failed to preview community keywords')
    res.status(500).json({ error: 'Failed to preview keywords' })
  }
})

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
