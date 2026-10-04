import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { evaluateGate, GATE_VERSION, type GateResult, type MarcaKey } from '../lib/gate.js'
import {
  MACHINE_STATES,
  effectiveMode,
  isReviewMode,
  publicCommunityWhere,
  temasVivos,
  type CommunityForVisibility,
  type ReviewMode,
  type ReviewState,
} from '../lib/communityVisibility.js'

const log = createLogger('community-review')

/**
 * Retencion por vertical (D4 del programa Las Otras Voces).
 * Diseño: .plans/2026-10-04_retencion-por-vertical.md
 *
 * Una nota puede estar publicada en Voces Indigenas y retenida en Voces Mapuche
 * o Voces Araucania hasta que un editor la libere. Este servicio escribe, por
 * cada nota y cada vertical en revision, lo que dijo el gate, y mantiene esas
 * filas al dia. Tres reglas que no se negocian:
 *
 *   1. NUNCA interrumpe la casa grande. `registerCommunityReviews` no lanza: un
 *      error queda en el log y la publicacion sigue (mismo contrato que
 *      writeAuditLog).
 *   2. La maquina NUNCA pisa a una persona. Toda escritura de maquina lleva
 *      `WHERE review_state IN ('auto', 'pending')`: una fila released o held no
 *      se toca. El fork tenia el defecto contrario (su upsert reescribia todo).
 *   3. Pertenecer a la vertical se decide con el mismo `where` que la pagina
 *      publica, asi lo que evaluo el gate y lo que la vertical muestra coinciden
 *      por construccion.
 */

export type GateTextSource = 'short' | 'full'

/** Lo que el gate necesita leer de una nota. */
export interface StoryForGate {
  id: string
  title: string | null
  titleLabel: string | null
  summary: string | null
  sourceTitle: string
  sourceContent: string
  narrativeFrame: string | null
  datePublished: Date | null
}

export const STORY_GATE_SELECT = {
  id: true,
  title: true,
  titleLabel: true,
  summary: true,
  sourceTitle: true,
  sourceContent: true,
  narrativeFrame: true,
  datePublished: true,
} as const

/** Una vertical en revision (modo distinto de off). */
export interface ReviewCommunity extends CommunityForVisibility {
  slug: string
  mode: ReviewMode
}

/**
 * El texto que evalua el gate. `short` es lo que se midio y calibro (titulo,
 * etiqueta y resumen); `full` suma el cuerpo de la fuente. La eleccion es del
 * director (diseño, seccion 5) y queda registrada en cada fila.
 */
export function gateTextFor(story: Pick<StoryForGate, 'title' | 'titleLabel' | 'summary' | 'sourceTitle' | 'sourceContent'>, source: GateTextSource): string {
  const parts = [story.title || story.sourceTitle, story.titleLabel, story.summary]
  if (source === 'full') parts.push(story.sourceContent)
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join('\n')
}

/**
 * Fuerza de la señal, para ordenar la cola del editor y decidir que se puede
 * liberar en masa (solo puntaje 0 y 1):
 *   3  encuadre narrativo «confrontacion»
 *   2  algun termino de la Lista A
 *   1  reservado: dos señales de la Lista B de familias distintas, si el director
 *      aprueba esa regla (hoy una B corroborada implica A o encuadre, puntaje >= 2)
 *   0  retenida solo por el modo aprendizaje, o no retenida
 */
export function gateScore(result: Pick<GateResult, 'reasons'>): number {
  if (result.reasons.includes('frame:confrontacion')) return 3
  if (result.reasons.some((r) => r.startsWith('listA:'))) return 2
  if (result.reasons.some((r) => r.startsWith('listB+corroborated:'))) return 1
  return 0
}

/** La marca del gate para una vertical. La calibracion por marca esta reservada en gate.ts. */
export function marcaFor(slug: string): MarcaKey {
  if (slug === 'mapuche') return 'mapuche'
  if (slug === 'wallmapu-araucania') return 'araucania'
  return 'indigenas'
}

export interface MachineReview {
  storyId: string
  communityId: string
  gateDecision: 'auto_publish' | 'held_for_review'
  gateReasons: string[]
  gateSignals: string[]
  gateScore: number
  gateLearningMode: boolean
  gateTextSource: GateTextSource
  gateVersion: string
  reviewState: Extract<ReviewState, 'auto' | 'pending'>
  /** Para una fila nueva en 'auto': desde cuando se ve en la vertical. */
  publishedAt: Date | null
}

/** Evalua una nota para una vertical. Funcion pura: no lee ni escribe la base. */
export function evaluateForCommunity(
  story: StoryForGate,
  community: Pick<ReviewCommunity, 'id' | 'slug'>,
  opts: { learningMode: boolean; textSource: GateTextSource },
): MachineReview {
  const result = evaluateGate(
    { narrativeFrame: story.narrativeFrame, text: gateTextFor(story, opts.textSource) },
    { learningMode: opts.learningMode, marca: marcaFor(community.slug) },
  )
  const reviewState = result.held ? 'pending' : 'auto'
  return {
    storyId: story.id,
    communityId: community.id,
    gateDecision: result.decision,
    gateReasons: result.reasons,
    gateSignals: result.signals,
    gateScore: gateScore(result),
    gateLearningMode: opts.learningMode,
    gateTextSource: opts.textSource,
    gateVersion: GATE_VERSION,
    reviewState,
    publishedAt: reviewState === 'auto' ? (story.datePublished ?? new Date()) : null,
  }
}

/**
 * Escribe la decision de la maquina. Si ya hay fila:
 *   - si la decidio una persona (released/held), NO se toca: el WHERE lo impide;
 *   - si es de maquina, se reescribe lo del gate, y published_at se conserva si
 *     ya tenia valor (nunca vuelve a null) o se fija ahora si la nota pasa a auto.
 */
export function machineUpsertSql(rev: MachineReview, now: Date): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO story_community_reviews (
      id, story_id, community_id,
      gate_decision, gate_reasons, gate_signals, gate_score, gate_learning_mode,
      gate_text_source, gate_version, gate_evaluated_at,
      review_state, published_at, created_at, updated_at
    ) VALUES (
      ${randomUUID()}, ${rev.storyId}, ${rev.communityId},
      ${rev.gateDecision}, ${rev.gateReasons}::text[], ${rev.gateSignals}::text[], ${rev.gateScore}, ${rev.gateLearningMode},
      ${rev.gateTextSource}, ${rev.gateVersion}, ${now},
      ${rev.reviewState}, ${rev.publishedAt}, ${now}, ${now}
    )
    ON CONFLICT (story_id, community_id) DO UPDATE SET
      gate_decision      = EXCLUDED.gate_decision,
      gate_reasons       = EXCLUDED.gate_reasons,
      gate_signals       = EXCLUDED.gate_signals,
      gate_score         = EXCLUDED.gate_score,
      gate_learning_mode = EXCLUDED.gate_learning_mode,
      gate_text_source   = EXCLUDED.gate_text_source,
      gate_version       = EXCLUDED.gate_version,
      gate_evaluated_at  = EXCLUDED.gate_evaluated_at,
      review_state       = EXCLUDED.review_state,
      published_at       = COALESCE(
                             story_community_reviews.published_at,
                             CASE WHEN EXCLUDED.review_state = 'auto' THEN ${now}::timestamp(3) ELSE NULL END
                           ),
      updated_at         = EXCLUDED.updated_at
    WHERE story_community_reviews.review_state IN ('auto', 'pending')
  `
}

/**
 * Las verticales en revision: con fila de modo distinta de off y activas.
 * LANZA si la tabla no existe: quien llama decide (el gancho lo traga, el job
 * lo reporta en job_runs.lastError).
 */
export async function communitiesUnderReview(slugs?: string[]): Promise<ReviewCommunity[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; slug: string; keywords: string[] | null; issue_ids: string[] | null; mode: string }>>`
    SELECT c.id, c.slug, c.keywords, c.issue_ids, m.mode
      FROM community_review_modes m
      JOIN communities c ON c.id = m.community_id
     WHERE m.mode <> 'off' AND c.active = true
     ORDER BY c.slug
  `
  return rows
    .filter((r) => isReviewMode(r.mode) && r.mode !== 'off')
    .filter((r) => !slugs || slugs.includes(r.slug))
    .map((r) => ({ id: r.id, slug: r.slug, keywords: r.keywords ?? [], issueIds: r.issue_ids ?? [], mode: r.mode as ReviewMode }))
}

/** Las notas que pertenecen a la vertical: el where de la pagina, sin la exclusion del modo. */
export function membershipWhere(community: CommunityForVisibility, temas: Set<string>): Prisma.StoryWhereInput {
  return publicCommunityWhere({ community, temas, mode: 'off', learningMode: false })
}

function gateOptions() {
  return { learningMode: config.gate.learningMode, textSource: config.gate.textSource as GateTextSource }
}

let warnedUnavailable = false

/**
 * EL GANCHO. Lo llaman los cinco caminos que dejan una nota publicada
 * (story.ts: bulkUpdateStatus, updateStoryStatus, publishStory, updateStory;
 * maintenance.ts: republish-slug). Para cada vertical en revision en la que la
 * nota encaja, registra lo que dijo el gate. NUNCA lanza.
 */
export async function registerCommunityReviews(storyIds: string[]): Promise<void> {
  if (storyIds.length === 0) return
  let communities: ReviewCommunity[]
  try {
    communities = await communitiesUnderReview()
  } catch (err) {
    // Lo esperable antes de que el director corra el SQL: la tabla no existe.
    // Se avisa una vez por proceso para no llenar el log en cada publicacion.
    if (!warnedUnavailable) {
      warnedUnavailable = true
      log.warn({ err }, 'community review tables unavailable; registration skipped until the migration is applied')
    }
    return
  }
  if (communities.length === 0) return

  const opts = gateOptions()
  let temas: Set<string>
  try {
    temas = await temasVivos()
  } catch (err) {
    log.error({ err }, 'community review: could not read live issues; registration skipped')
    return
  }
  for (const community of communities) {
    try {
      const stories = await prisma.story.findMany({
        where: { AND: [{ id: { in: storyIds } }, membershipWhere(community, temas)] },
        select: STORY_GATE_SELECT,
      })
      const now = new Date()
      let pending = 0
      for (const story of stories) {
        const rev = evaluateForCommunity(story, community, opts)
        if (rev.reviewState === 'pending') pending++
        await prisma.$executeRaw(machineUpsertSql(rev, now))
      }
      if (stories.length > 0) {
        log.info({ slug: community.slug, mode: community.mode, evaluated: stories.length, pending }, 'community review registered')
      }
    } catch (err) {
      log.error({ err, slug: community.slug, count: storyIds.length }, 'community review registration failed for one vertical')
    }
  }
}

export interface ReconcileReport {
  slug: string
  mode: ReviewMode
  created: number
  reevaluated: number
  deleted: number
  byState: Record<ReviewState, number>
}

const RECONCILE_BATCH = 200

/**
 * EL CONCILIADOR (job reconcile_community_reviews, y la carga inicial). Por cada
 * vertical en revision:
 *   1. crea filas para notas que encajan y no tienen (cambios de palabras clave,
 *      notas publicadas antes de encender la revision, caminos sin gancho);
 *   2. reevalua las filas de maquina si cambiaron las listas, el texto evaluado o
 *      el modo aprendizaje, o si la nota se edito despues de evaluarse;
 *   3. borra las filas de maquina cuya nota ya no encaja o ya no esta publicada;
 *   4. nunca toca released ni held.
 * Idempotente: una segunda corrida sin cambios no escribe nada. LANZA ante
 * errores: como job, el error debe quedar en job_runs.
 */
export async function reconcileCommunityReviews(opts: { slugs?: string[]; force?: boolean } = {}): Promise<ReconcileReport[]> {
  const communities = await communitiesUnderReview(opts.slugs)
  if (communities.length === 0) return []
  const temas = await temasVivos()
  const gate = gateOptions()
  const reports: ReconcileReport[] = []

  for (const community of communities) {
    const membership = membershipWhere(community, temas)
    let created = 0
    let reevaluated = 0

    // 1. Faltantes. Se pide de a lotes; cada lote escribe sus filas y el siguiente
    //    ya no las ve. El tope de vueltas evita un ciclo si una escritura fallara.
    for (let vuelta = 0; vuelta < 10_000; vuelta++) {
      const missing = await prisma.story.findMany({
        where: { AND: [membership, { communityReviews: { none: { communityId: community.id } } }] },
        select: STORY_GATE_SELECT,
        orderBy: { id: 'asc' },
        take: RECONCILE_BATCH,
      })
      if (missing.length === 0) break
      const now = new Date()
      for (const story of missing) {
        await prisma.$executeRaw(machineUpsertSql(evaluateForCommunity(story, community, gate), now))
        created++
      }
      if (missing.length < RECONCILE_BATCH) break
    }

    // 2. Filas de maquina viejas.
    const stale = await prisma.$queryRaw<Array<{ story_id: string }>>`
      SELECT r.story_id
        FROM story_community_reviews r
        JOIN stories s ON s.id = r.story_id
       WHERE r.community_id = ${community.id}
         AND r.review_state IN ('auto', 'pending')
         AND (
               ${opts.force === true}
            OR r.gate_version       <> ${GATE_VERSION}
            OR r.gate_text_source   <> ${gate.textSource}
            OR r.gate_learning_mode <> ${gate.learningMode}
            OR s.updated_at          > r.gate_evaluated_at
         )
    `
    const staleIds = stale.map((r) => r.story_id)

    // 3. Huerfanas: filas de maquina cuya nota ya no encaja en la vertical.
    const machineRows = await prisma.storyCommunityReview.findMany({
      where: { communityId: community.id, reviewState: { in: [...MACHINE_STATES] } },
      select: { storyId: true },
    })
    const machineIds = machineRows.map((r) => r.storyId)
    const stillMembers = new Set<string>()
    for (let i = 0; i < machineIds.length; i += 1000) {
      const chunk = machineIds.slice(i, i + 1000)
      const found = await prisma.story.findMany({
        where: { AND: [{ id: { in: chunk } }, membership] },
        select: { id: true },
      })
      for (const f of found) stillMembers.add(f.id)
    }
    const orphanIds = machineIds.filter((id) => !stillMembers.has(id))
    let deleted = 0
    if (orphanIds.length > 0) {
      const res = await prisma.storyCommunityReview.deleteMany({
        where: { communityId: community.id, reviewState: { in: [...MACHINE_STATES] }, storyId: { in: orphanIds } },
      })
      deleted = res.count
    }

    const toReevaluate = staleIds.filter((id) => stillMembers.has(id))
    for (let i = 0; i < toReevaluate.length; i += RECONCILE_BATCH) {
      const chunk = toReevaluate.slice(i, i + RECONCILE_BATCH)
      const stories = await prisma.story.findMany({ where: { id: { in: chunk } }, select: STORY_GATE_SELECT })
      const now = new Date()
      for (const story of stories) {
        await prisma.$executeRaw(machineUpsertSql(evaluateForCommunity(story, community, gate), now))
        reevaluated++
      }
    }

    const grouped = await prisma.storyCommunityReview.groupBy({
      by: ['reviewState'],
      where: { communityId: community.id },
      _count: { _all: true },
    })
    const byState: Record<ReviewState, number> = { auto: 0, pending: 0, released: 0, held: 0 }
    for (const g of grouped) {
      if (g.reviewState in byState) byState[g.reviewState as ReviewState] = g._count._all
    }

    const report: ReconcileReport = { slug: community.slug, mode: community.mode, created, reevaluated, deleted, byState }
    log.info(report, 'community reviews reconciled')
    reports.push(report)
  }
  return reports
}

export interface CommunityReviewStats {
  mode: ReviewMode
  effectiveMode: ReviewMode
  learningMode: boolean
  /** Lo que la pagina publica muestra hoy, con el modo vigente. */
  visibleToday: number
  /** Lo que mostraria si se pasara a enforce ahora (con el aprendizaje apagado). */
  visibleIfEnforced: number
  byState: Record<ReviewState, number>
  /** Notas que encajan en la vertical y aun no tienen fila: las invisibles en enforce. */
  missingRows: number
}

/**
 * El instrumento de calibracion: «hoy se ven N; si aplicaras, se verian M».
 * Calculado con la MISMA funcion que la pagina publica, para que el numero de la
 * pantalla del editor y el de la pagina no puedan divergir.
 */
export async function communityReviewStats(community: CommunityForVisibility, mode: ReviewMode): Promise<CommunityReviewStats> {
  const temas = await temasVivos()
  const learningMode = config.gate.learningMode
  const [visibleToday, visibleIfEnforced, missingRows, grouped] = await Promise.all([
    prisma.story.count({ where: publicCommunityWhere({ community, temas, mode, learningMode }) }),
    prisma.story.count({ where: publicCommunityWhere({ community, temas, mode: 'enforce', learningMode: false }) }),
    prisma.story.count({ where: { AND: [membershipWhere(community, temas), { communityReviews: { none: { communityId: community.id } } }] } }),
    prisma.storyCommunityReview.groupBy({ by: ['reviewState'], where: { communityId: community.id }, _count: { _all: true } }),
  ])
  const byState: Record<ReviewState, number> = { auto: 0, pending: 0, released: 0, held: 0 }
  for (const g of grouped) {
    if (g.reviewState in byState) byState[g.reviewState as ReviewState] = g._count._all
  }
  return { mode, effectiveMode: effectiveMode(mode, learningMode), learningMode, visibleToday, visibleIfEnforced, byState, missingRows }
}
