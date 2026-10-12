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
  reviewExclusion,
  temasVivos,
  type CommunityForVisibility,
  type ReviewMode,
  type ReviewState,
  VISIBLE_WHEN_ENFORCED,
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
 *   1  B+B: dos terminos de la Lista B de familias distintas (aprobada por el
 *      director el 11-oct-2026; familias en gate.ts, FAMILIAS_B). Una B
 *      corroborada por A o por el encuadre ya tiene puntaje 2 o 3.
 *   0  retenida solo por el modo aprendizaje, o no retenida
 */
export function gateScore(result: Pick<GateResult, 'reasons'>): number {
  if (result.reasons.includes('frame:confrontacion')) return 3
  if (result.reasons.some((r) => r.startsWith('listA:'))) return 2
  if (result.reasons.some((r) => r.startsWith('listB+B:') || r.startsWith('listB+corroborated:'))) return 1
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
 * Una fecha de JS como timestamp SIN zona en UTC, sea cual sea la zona de la
 * sesion de la base. Hace falta porque las columnas son `timestamp(3)` (sin
 * zona): Prisma, en sus escrituras propias, guarda UTC; pero un Date pasado
 * como parametro a SQL crudo se convierte con la zona de la sesion. Medido el
 * 4-oct-2026: con la sesion en Europe/London, gate_evaluated_at quedaba una hora
 * adelantada respecto de stories.updated_at, y el conciliador habria dejado de
 * ver como vieja una nota editada en esa hora. Azure corre en UTC y no se nota;
 * el codigo no debe depender de eso.
 */
function utc(d: Date | null): Prisma.Sql {
  return d === null ? Prisma.sql`NULL` : Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`
}

/**
 * Escribe la decision de la maquina. Si ya hay fila:
 *   - si la decidio una persona (released/held), NO se toca: el WHERE lo impide;
 *   - si es de maquina, se reescribe lo del gate, y published_at se conserva si
 *     ya tenia valor (nunca vuelve a null) o se fija ahora si la nota pasa a auto.
 *
 * `created_at` es CUANDO LA NOTA ENTRO A LA COLA, y de el se mide cuanto lleva
 * esperando (la alerta de 48 h y el criterio para apagar el aprendizaje). Por eso
 * una fila que estaba en auto y la reevaluacion pasa a pending (cambio de listas,
 * de palabras clave o de la nota) lo reinicia: entra a la cola ahora, no el dia en
 * que nacio como auto. Una pendiente que sigue pendiente lo conserva. Visto en la
 * revision adversarial del 11-oct-2026: sin esto, una nota recien retenida
 * aparecia con «216 h» y encendia la alerta.
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
      ${rev.gateTextSource}, ${rev.gateVersion}, ${utc(now)},
      ${rev.reviewState}, ${utc(rev.publishedAt)}, ${utc(now)}, ${utc(now)}
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
                             CASE WHEN EXCLUDED.review_state = 'auto' THEN ${utc(now)} ELSE NULL END
                           ),
      created_at         = CASE
                             WHEN story_community_reviews.review_state <> 'pending' AND EXCLUDED.review_state = 'pending'
                             THEN EXCLUDED.created_at
                             ELSE story_community_reviews.created_at
                           END,
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
  /**
   * Lo que mostraria en enforce. Con el aprendizaje APAGADO es el where real de
   * enforce. Con el aprendizaje ENCENDIDO todas las filas de maquina estan
   * pendientes y ese numero seria 0 siempre (visto el 6-oct-2026: «si
   * aplicaras, 0» con 409 notas), asi que se PROYECTA: lo que el gate no habria
   * retenido sin el aprendizaje (auto, released, o pendiente con puntaje 0).
   */
  visibleIfEnforced: number
  /** true cuando visibleIfEnforced es la proyeccion de arriba, no el where real. */
  visibleIfEnforcedProjected: boolean
  byState: Record<ReviewState, number>
  /** Notas que encajan en la vertical y aun no tienen fila: las invisibles en enforce. */
  missingRows: number
  /**
   * Desde cuando espera la pendiente mas vieja: cuando su fila entro a la cola
   * (`created_at`), o null si no hay pendientes. No se mide por la fecha de
   * evaluacion: el conciliador la reescribe cada vez que cambian las listas, y
   * con eso una cola de una semana parecia recien llegada y la alerta se apagaba
   * sola en cada cambio del gate.
   */
  oldestPendingAt: Date | null
  oldestPendingHours: number | null
  /** true cuando la pendiente mas vieja supera config.gate.queueAlertHours. */
  queueAlert: boolean
  /** Si ya se cumple el criterio del director para apagar el modo aprendizaje. */
  learningExit: LearningExitCriteria
}

/**
 * El criterio del director para apagar el modo aprendizaje (11-oct-2026,
 * «ambos»): por fecha Y por datos. Las tres condiciones, cada una con su cifra,
 * para que la pantalla diga cuanto falta y no solo si/no.
 */
export interface LearningExitCriteria {
  /** Cuando la vertical entro en revision: su primera fila (la carga inicial en sombra). */
  reviewSince: Date | null
  /** reviewSince + minDays. Antes de esa fecha no se apaga. */
  earliestOffAt: Date | null
  dateMet: boolean
  /**
   * Desde cuando la cola esta al dia: ninguna nota espero mas de queueAlertHours
   * sin que una persona la decidiera. null si hoy hay una pendiente vencida.
   */
  queueCurrentSince: Date | null
  queueCurrentDays: number
  queueMet: boolean
  /** Decisiones de personas sobre notas de puntaje 0 en la ventana: las que el gate habria dejado pasar. */
  score0Decided: number
  score0Released: number
  score0Met: boolean
  met: boolean
  thresholds: {
    minDays: number
    windowDays: number
    score0ReleaseRatio: number
    score0MinDecisions: number
    queueAlertHours: number
  }
}

const DIA_MS = 86_400_000

/**
 * Lee de las filas de la vertical lo que el criterio necesita, en una sola
 * consulta. Las cuentas usan el estado ACTUAL de cada fila: una nota liberada y
 * despues reabierta no cuenta como liberada. Una fila reabierta pierde su
 * `reviewed_at`, asi que para la cola cuenta como no decidida desde que entro:
 * es el error del lado prudente.
 */
export async function learningExitCriteria(communityId: string, now: Date = new Date()): Promise<LearningExitCriteria> {
  const { minDays, windowDays, score0ReleaseRatio, score0MinDecisions } = config.gate.learningExit
  const queueAlertHours = config.gate.queueAlertHours
  const rows = await prisma.$queryRaw<
    Array<{
      review_since: Date | null
      overdue_now: boolean | null
      last_overdue_end: Date | null
      score0_decided: number | null
      score0_released: number | null
    }>
  >`
    SELECT
      MIN(created_at) AS review_since,
      BOOL_OR(review_state = 'pending' AND created_at < ${utc(now)} - (${queueAlertHours}::int * interval '1 hour')) AS overdue_now,
      MAX(reviewed_at) FILTER (
        WHERE review_state IN ('released', 'held')
          AND reviewed_at > created_at + (${queueAlertHours}::int * interval '1 hour')
      ) AS last_overdue_end,
      (COUNT(*) FILTER (
        WHERE review_state IN ('released', 'held') AND gate_score = 0
          AND reviewed_at >= ${utc(now)} - (${windowDays}::int * interval '1 day')
      ))::int AS score0_decided,
      (COUNT(*) FILTER (
        WHERE review_state = 'released' AND gate_score = 0
          AND reviewed_at >= ${utc(now)} - (${windowDays}::int * interval '1 day')
      ))::int AS score0_released
    FROM story_community_reviews
    WHERE community_id = ${communityId}
  `
  const r = Array.isArray(rows) ? rows[0] : undefined
  const reviewSince = r?.review_since ?? null
  const earliestOffAt = reviewSince ? new Date(reviewSince.getTime() + minDays * DIA_MS) : null
  const dateMet = earliestOffAt !== null && now.getTime() >= earliestOffAt.getTime()

  // Al dia desde la ultima vez que una nota vencida fue decidida; si nunca vencio
  // ninguna, desde que la vertical entro en revision. Si hoy hay una vencida, no lo esta.
  const queueCurrentSince = r?.overdue_now ? null : (r?.last_overdue_end ?? reviewSince)
  const queueCurrentDays = queueCurrentSince ? Math.max(0, Math.floor((now.getTime() - queueCurrentSince.getTime()) / DIA_MS)) : 0
  const queueMet = queueCurrentSince !== null && queueCurrentDays >= windowDays

  const score0Decided = Number(r?.score0_decided ?? 0)
  const score0Released = Number(r?.score0_released ?? 0)
  // Entero y con tolerancia, porque el umbral se puede cambiar por variable de
  // entorno: con 0.9 la coma flotante no molesta, pero 0.55 * 100 da
  // 55.00000000000001, y 55 liberadas de 100 deben cumplir.
  const score0Needed = Math.ceil(score0ReleaseRatio * score0Decided - 1e-9)
  const score0Met = score0Decided >= score0MinDecisions && score0Released >= score0Needed

  return {
    reviewSince,
    earliestOffAt,
    dateMet,
    queueCurrentSince,
    queueCurrentDays,
    queueMet,
    score0Decided,
    score0Released,
    score0Met,
    met: dateMet && queueMet && score0Met,
    thresholds: { minDays, windowDays, score0ReleaseRatio, score0MinDecisions, queueAlertHours },
  }
}

/**
 * El instrumento de calibracion: «hoy se ven N; si aplicaras, se verian M».
 * Calculado con la MISMA funcion que la pagina publica, para que el numero de la
 * pantalla del editor y el de la pagina no puedan divergir.
 */
export async function communityReviewStats(community: CommunityForVisibility, mode: ReviewMode): Promise<CommunityReviewStats> {
  const temas = await temasVivos()
  const learningMode = config.gate.learningMode
  // Proyeccion bajo aprendizaje: una fila pendiente con puntaje 0 esta retenida
  // SOLO por el modo aprendizaje; sin el, el gate la habria dejado en auto.
  const proyeccionSinAprendizaje: Prisma.StoryWhereInput = {
    AND: [
      membershipWhere(community, temas),
      {
        communityReviews: {
          some: {
            communityId: community.id,
            OR: [{ reviewState: { in: [...VISIBLE_WHEN_ENFORCED] } }, { reviewState: 'pending', gateScore: 0 }],
          },
        },
      },
    ],
  }
  const [visibleToday, visibleIfEnforced, missingRows, grouped, oldest, learningExit] = await Promise.all([
    prisma.story.count({ where: publicCommunityWhere({ community, temas, mode, learningMode }) }),
    prisma.story.count({
      where: learningMode ? proyeccionSinAprendizaje : publicCommunityWhere({ community, temas, mode: 'enforce', learningMode: false }),
    }),
    prisma.story.count({ where: { AND: [membershipWhere(community, temas), { communityReviews: { none: { communityId: community.id } } }] } }),
    prisma.storyCommunityReview.groupBy({ by: ['reviewState'], where: { communityId: community.id }, _count: { _all: true } }),
    prisma.storyCommunityReview.findFirst({
      where: { communityId: community.id, reviewState: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { createdAt: true },
    }),
    learningExitCriteria(community.id),
  ])
  const byState: Record<ReviewState, number> = { auto: 0, pending: 0, released: 0, held: 0 }
  for (const g of grouped) {
    if (g.reviewState in byState) byState[g.reviewState as ReviewState] = g._count._all
  }
  const oldestPendingAt = oldest ? oldest.createdAt : null
  const oldestPendingHours = oldestPendingAt ? Math.floor((Date.now() - oldestPendingAt.getTime()) / 3_600_000) : null
  // Con el aprendizaje encendido todo es pendiente por diseño: la alerta solo tiene sentido cuando el gate ya decide.
  const queueAlert = !learningMode && oldestPendingHours !== null && oldestPendingHours >= config.gate.queueAlertHours
  return {
    mode,
    effectiveMode: effectiveMode(mode, learningMode),
    learningMode,
    visibleToday,
    visibleIfEnforced,
    visibleIfEnforcedProjected: learningMode,
    byState,
    missingRows,
    oldestPendingAt,
    oldestPendingHours,
    queueAlert,
    learningExit,
  }
}

/**
 * Las notas, de entre `storyIds`, que alguna vertical en `enforce` EFECTIVO no
 * muestra: encajan en ella y no tienen fila `auto` ni `released` (pendientes,
 * retenidas, o todavia sin fila, que en enforce es lo mismo: cierre por defecto).
 *
 * Para el autopost a redes (decision del director del 11-oct-2026: «excluir
 * pendientes y retenidas de una vertical en enforce»). Sin esto, una nota
 * retenida en Voces Mapuche podia ser la nota del dia en seis canales media
 * hora despues de publicarse en la casa grande.
 *
 * Con el aprendizaje encendido ninguna vertical esta en enforce efectivo
 * (effectiveMode la degrada a sombra): devuelve vacio sin consultar.
 *
 * NUNCA lanza, y ante un error FALLA CERRADO: devuelve todas las notas, y el
 * autopost se salta esa corrida. Es al reves que getReviewMode, que trata un
 * error como 'off' para que la pagina no se vacie; aca los costos no son
 * simetricos: saltarse una corrida cuesta un post que sale en la siguiente, y
 * publicar en redes una nota retenida no se deshace.
 */
export async function withheldInEnforcedVerticals(storyIds: string[]): Promise<Set<string>> {
  const retenidas = new Set<string>()
  if (storyIds.length === 0 || config.gate.learningMode) return retenidas
  try {
    const enforced = (await communitiesUnderReview()).filter((c) => effectiveMode(c.mode, config.gate.learningMode) === 'enforce')
    if (enforced.length === 0) return retenidas
    const temas = await temasVivos()
    for (const c of enforced) {
      const visible = reviewExclusion(c.id, 'enforce')!
      const ocultas = await prisma.story.findMany({
        where: { AND: [{ id: { in: storyIds } }, membershipWhere(c, temas), { NOT: visible }] },
        select: { id: true },
      })
      for (const s of ocultas) retenidas.add(s.id)
    }
  } catch (err) {
    log.error({ err, count: storyIds.length }, 'could not read verticals in enforce; withholding every candidate from this autopost run')
    for (const id of storyIds) retenidas.add(id)
  }
  return retenidas
}
