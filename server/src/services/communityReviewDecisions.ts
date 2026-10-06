import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import {
  effectiveMode,
  isReviewMode,
  publicCommunityWhere,
  temasVivos,
  type CommunityForVisibility,
  type ReviewMode,
  type ReviewState,
} from '../lib/communityVisibility.js'
import { writeAuditLog, writeAuditLogs, type AuditActor } from './audit.js'
import { communityReviewStats, reconcileCommunityReviews, type CommunityReviewStats, type ReconcileReport } from './communityReview.js'

const log = createLogger('community-review-decisions')

/**
 * Lo que una PERSONA hace sobre la retencion por vertical (D4, Tanda B, item
 * 12): liberar, retener, reabrir y cambiar el modo. La maquina escribe en
 * services/communityReview.ts; aqui se escribe solo lo humano, y cada escritura
 * deja una fila en audit_log con las razones del gate y el texto del editor.
 *
 * Diseño: .plans/2026-10-04_retencion-por-vertical.md, seccion 7.
 */

export type ReviewDecision = 'release' | 'hold' | 'reopen'
export type ReviewCode = 'sensitive' | 'out_of_scope'

/**
 * Liberar en masa se niega si alguna nota seleccionada supera este puntaje:
 * las señales fuertes (2 = lista A, 3 = encuadre de confrontacion) se liberan
 * de a una, leyendo la nota. Retener en masa siempre se permite: es el error
 * barato. La guardia vive en el servidor, no en la pantalla.
 */
export const BULK_RELEASE_MAX_SCORE = 1

export class ReviewError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ReviewError'
  }
}

export interface ReviewCommunityRef extends CommunityForVisibility {
  slug: string
  name: string
  active: boolean
  mode: ReviewMode
}

/** La vertical por slug, con su modo (sin fila = off). Null si no existe. */
export async function findReviewCommunity(slug: string): Promise<ReviewCommunityRef | null> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; slug: string; name: string; active: boolean; keywords: string[] | null; issue_ids: string[] | null; mode: string | null }>
  >`
    SELECT c.id, c.slug, c.name, c.active, c.keywords, c.issue_ids, m.mode
      FROM communities c
      LEFT JOIN community_review_modes m ON m.community_id = c.id
     WHERE c.slug = ${slug}
     LIMIT 1
  `
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    active: r.active,
    keywords: r.keywords ?? [],
    issueIds: r.issue_ids ?? [],
    mode: isReviewMode(r.mode) ? r.mode : 'off',
  }
}

/** El estado que la maquina habia dejado, para «reabrir». */
export function stateFromMachine(gateDecision: string): ReviewState {
  return gateDecision === 'auto_publish' ? 'auto' : 'pending'
}

const QUEUE_STORY_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleLabel: true,
  sourceTitle: true,
  summary: true,
  narrativeFrame: true,
  datePublished: true,
  relevance: true,
} as const

export interface ReviewQueueItem {
  id: string
  storyId: string
  reviewState: ReviewState
  reviewCode: string | null
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  gateDecision: string
  gateReasons: string[]
  gateSignals: string[]
  gateScore: number
  gateLearningMode: boolean
  gateVersion: string
  gateEvaluatedAt: Date
  publishedAt: Date | null
  story: {
    id: string
    slug: string | null
    title: string | null
    titleLabel: string | null
    sourceTitle: string
    summary: string | null
    narrativeFrame: string | null
    datePublished: Date | null
    relevance: number | null
  }
  /** La misma nota en OTRAS verticales en revision: «tambien en: Araucania (pendiente)». */
  alsoIn: Array<{ slug: string; name: string; reviewState: ReviewState }>
}

/**
 * La cola: por fuerza de señal (puntaje) y luego por fecha de publicacion, las
 * mas nuevas primero. El indice story_community_reviews_queue_idx cubre este
 * orden.
 */
export async function listReviews(args: {
  community: Pick<ReviewCommunityRef, 'id'>
  state?: ReviewState
  page: number
  pageSize: number
}): Promise<{ data: ReviewQueueItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const { community, state, page, pageSize } = args
  const where: Prisma.StoryCommunityReviewWhereInput = { communityId: community.id, ...(state ? { reviewState: state } : {}) }
  const [total, rows] = await Promise.all([
    prisma.storyCommunityReview.count({ where }),
    prisma.storyCommunityReview.findMany({
      where,
      orderBy: [{ gateScore: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { story: { select: QUEUE_STORY_SELECT } },
    }),
  ])

  const storyIds = rows.map((r) => r.storyId)
  const others =
    storyIds.length === 0
      ? []
      : await prisma.storyCommunityReview.findMany({
          where: { storyId: { in: storyIds }, communityId: { not: community.id } },
          select: { storyId: true, reviewState: true, community: { select: { slug: true, name: true } } },
        })
  const alsoIn = new Map<string, ReviewQueueItem['alsoIn']>()
  for (const o of others) {
    const lista = alsoIn.get(o.storyId) ?? []
    lista.push({ slug: o.community.slug, name: o.community.name, reviewState: o.reviewState as ReviewState })
    alsoIn.set(o.storyId, lista)
  }

  const data: ReviewQueueItem[] = rows.map((r) => ({
    id: r.id,
    storyId: r.storyId,
    reviewState: r.reviewState as ReviewState,
    reviewCode: r.reviewCode,
    reviewNote: r.reviewNote,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
    gateDecision: r.gateDecision,
    gateReasons: r.gateReasons,
    gateSignals: r.gateSignals,
    gateScore: r.gateScore,
    gateLearningMode: r.gateLearningMode,
    gateVersion: r.gateVersion,
    gateEvaluatedAt: r.gateEvaluatedAt,
    publishedAt: r.publishedAt,
    story: r.story,
    alsoIn: alsoIn.get(r.storyId) ?? [],
  }))
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

interface DecisionInput {
  decision: ReviewDecision
  code?: ReviewCode
  note?: string
  actor: AuditActor
}

/** Los campos que cambia cada decision. `reopen` devuelve la fila a lo que dijo la maquina. */
function dataFor(input: DecisionInput, gateDecision: string, now: Date): Prisma.StoryCommunityReviewUpdateManyMutationInput {
  switch (input.decision) {
    case 'release':
      return { reviewState: 'released', reviewCode: null, reviewNote: input.note ?? null, reviewedBy: input.actor.userId ?? null, reviewedAt: now }
    case 'hold':
      return { reviewState: 'held', reviewCode: input.code!, reviewNote: input.note ?? null, reviewedBy: input.actor.userId ?? null, reviewedAt: now }
    case 'reopen':
      return { reviewState: stateFromMachine(gateDecision), reviewCode: null, reviewNote: null, reviewedBy: null, reviewedAt: null }
  }
}

function validarCodigo(input: DecisionInput): void {
  if (input.decision === 'hold' && !input.code) {
    throw new ReviewError(400, 'Retener pide un codigo: sensitive o out_of_scope')
  }
}

/** Una decision sobre una nota en una vertical. 404 si la nota no tiene fila ahi. */
export async function decideReview(args: { community: ReviewCommunityRef; storyId: string } & DecisionInput) {
  const { community, storyId } = args
  validarCodigo(args)
  const row = await prisma.storyCommunityReview.findUnique({
    where: { storyId_communityId: { storyId, communityId: community.id } },
  })
  if (!row) throw new ReviewError(404, 'La nota no esta registrada en esta vertical')

  const now = new Date()
  const data = dataFor(args, row.gateDecision, now)
  const updated = await prisma.storyCommunityReview.update({ where: { id: row.id }, data })

  await writeAuditLog({
    actor: args.actor,
    action: `community_review.${args.decision}`,
    targetType: 'story_community_review',
    targetId: row.id,
    metadata: {
      slug: community.slug,
      storyId,
      from: row.reviewState,
      to: data.reviewState,
      gateScore: row.gateScore,
      gateReasons: row.gateReasons,
      code: args.code ?? null,
      note: args.note ?? null,
    },
  })
  log.info({ slug: community.slug, storyId, decision: args.decision, from: row.reviewState, to: data.reviewState }, 'review decided')
  return updated
}

export interface BulkDecisionReport {
  /** Filas que de verdad cambiaron (el conteo de updateMany, no el largo de la lista). */
  updated: number
  /** Ids pedidos que no tienen fila en esta vertical. */
  missing: string[]
}

/**
 * Varias notas de una vez. Para liberar, la guardia de puntaje: si alguna
 * supera BULK_RELEASE_MAX_SCORE, 409 con los ids, y no se toca ninguna.
 */
export async function decideReviews(args: { community: ReviewCommunityRef; storyIds: string[] } & DecisionInput): Promise<BulkDecisionReport> {
  const { community, storyIds } = args
  validarCodigo(args)
  const ids = [...new Set(storyIds)]
  const rows = await prisma.storyCommunityReview.findMany({
    where: { communityId: community.id, storyId: { in: ids } },
    select: { id: true, storyId: true, reviewState: true, gateDecision: true, gateScore: true, gateReasons: true },
  })
  const encontrados = new Set(rows.map((r) => r.storyId))
  const missing = ids.filter((id) => !encontrados.has(id))

  if (args.decision === 'release') {
    const fuertes = rows.filter((r) => r.gateScore > BULK_RELEASE_MAX_SCORE)
    if (fuertes.length > 0) {
      throw new ReviewError(409, 'Las notas con señal fuerte se liberan de a una', {
        storyIds: fuertes.map((r) => r.storyId),
        maxScore: BULK_RELEASE_MAX_SCORE,
      })
    }
  }
  if (rows.length === 0) return { updated: 0, missing }

  const now = new Date()
  let updated = 0
  if (args.decision === 'reopen') {
    // Cada fila vuelve a SU estado de maquina: dos grupos, dos updateMany.
    const porEstado = new Map<ReviewState, string[]>()
    for (const r of rows) {
      const estado = stateFromMachine(r.gateDecision)
      porEstado.set(estado, [...(porEstado.get(estado) ?? []), r.id])
    }
    for (const [estado, rowIds] of porEstado) {
      const res = await prisma.storyCommunityReview.updateMany({
        where: { id: { in: rowIds } },
        data: { reviewState: estado, reviewCode: null, reviewNote: null, reviewedBy: null, reviewedAt: null },
      })
      updated += res.count
    }
  } else {
    const res = await prisma.storyCommunityReview.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: dataFor(args, '', now),
    })
    updated = res.count
  }

  await writeAuditLogs(
    rows.map((r) => ({
      actor: args.actor,
      action: `community_review.${args.decision}`,
      targetType: 'story_community_review',
      targetId: r.id,
      metadata: {
        slug: community.slug,
        storyId: r.storyId,
        from: r.reviewState,
        to: args.decision === 'reopen' ? stateFromMachine(r.gateDecision) : args.decision === 'release' ? 'released' : 'held',
        gateScore: r.gateScore,
        gateReasons: r.gateReasons,
        code: args.code ?? null,
        note: args.note ?? null,
        bulk: true,
      },
    })),
  )
  log.info({ slug: community.slug, decision: args.decision, updated, missing: missing.length }, 'reviews decided in bulk')
  return { updated, missing }
}

export interface ModePreview {
  mode: ReviewMode
  effectiveMode: ReviewMode
  learningMode: boolean
  /** Lo que la pagina muestra hoy, con el modo vigente. */
  visibleNow: number
  /** Lo que mostraria con el modo pedido (efectivo). */
  visibleAfter: number
  /** Notas que dejarian de verse. Negativo si aparecerian mas. */
  hidden: number
}

/**
 * «Si pasas a este modo, se ocultan N notas»: el numero exacto, con la misma
 * funcion que la pagina publica, ANTES de cambiar nada.
 */
export async function previewMode(community: ReviewCommunityRef, mode: ReviewMode): Promise<ModePreview> {
  const temas = await temasVivos()
  const learningMode = config.gate.learningMode
  const [visibleNow, visibleAfter] = await Promise.all([
    prisma.story.count({ where: publicCommunityWhere({ community, temas, mode: community.mode, learningMode }) }),
    prisma.story.count({ where: publicCommunityWhere({ community, temas, mode, learningMode }) }),
  ])
  return { mode, effectiveMode: effectiveMode(mode, learningMode), learningMode, visibleNow, visibleAfter, hidden: visibleNow - visibleAfter }
}

export interface SetModeReport {
  from: ReviewMode
  to: ReviewMode
  effectiveMode: ReviewMode
  preview: ModePreview
  /** Si la vertical entro en revision desde off, la carga inicial que se corrio. */
  reconciled: ReconcileReport | null
}

/**
 * Cambia el interruptor. Solo un administrador llega aqui (lo decide la ruta).
 * 409 a `enforce` con el aprendizaje encendido: el candado de effectiveMode lo
 * degradaria a sombra en silencio, y un interruptor que dice una cosa y hace
 * otra es peor que negarse. Al salir de off corre el conciliador, para que la
 * cola exista desde el primer minuto.
 */
export async function setReviewMode(args: { community: ReviewCommunityRef; mode: ReviewMode; actor: AuditActor }): Promise<SetModeReport> {
  const { community, mode, actor } = args
  if (mode === 'enforce' && config.gate.learningMode) {
    throw new ReviewError(409, 'Con el modo aprendizaje encendido no se puede aplicar: el gate retiene el 100 % y la vertical quedaria vacia', {
      learningMode: true,
    })
  }
  const preview = await previewMode(community, mode)
  await prisma.communityReviewMode.upsert({
    where: { communityId: community.id },
    create: { communityId: community.id, mode, updatedBy: actor.userId ?? null },
    update: { mode, updatedBy: actor.userId ?? null, updatedAt: new Date() },
  })
  await writeAuditLog({
    actor,
    action: 'community_review.mode',
    targetType: 'community',
    targetId: community.id,
    metadata: { slug: community.slug, from: community.mode, to: mode, effectiveMode: preview.effectiveMode, visibleNow: preview.visibleNow, visibleAfter: preview.visibleAfter },
  })
  log.info({ slug: community.slug, from: community.mode, to: mode, hidden: preview.hidden }, 'review mode changed')

  let reconciled: ReconcileReport | null = null
  if (community.mode === 'off' && mode !== 'off') {
    const [rep] = await reconcileCommunityReviews({ slugs: [community.slug] })
    reconciled = rep ?? null
  }
  return { from: community.mode, to: mode, effectiveMode: preview.effectiveMode, preview, reconciled }
}

export async function statsFor(community: ReviewCommunityRef): Promise<CommunityReviewStats> {
  return communityReviewStats(community, community.mode)
}
