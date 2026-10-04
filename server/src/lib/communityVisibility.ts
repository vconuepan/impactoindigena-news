import type { Prisma } from '@prisma/client'
import prisma from './prisma.js'
import { createLogger } from './logger.js'

const log = createLogger('community-visibility')

/**
 * Que notas muestra una vertical. Es el UNICO lugar donde se decide, para que
 * la pagina, el panel de señales, el RSS, el digest y el correo de bienvenida
 * no vuelvan a tener reglas distintas (al 4-oct-2026 tenian tres: el RSS de
 * Voces Mapuche entregaba 41 notas contra las 387 de la pagina).
 *
 * Diseño: .plans/2026-10-04_retencion-por-vertical.md, secciones 4 y 6.
 */

/**
 * Como se decide que historias pertenecen a una comunidad.
 *
 * EL PROBLEMA QUE REPARA. La condicion era `issueId IN (issue_ids)` Y las
 * palabras clave, las dos obligatorias. Los `issue_ids` se cargaron en el seed
 * con identificadores que ya no existen —`issue-chile-005`, `issue-paz-004`—,
 * asi que al 4-sep-2026 ONCE de las dieciseis comunidades apuntaban a algun
 * tema fantasma y dos mostraban CERO historias. "Pueblo Mapuche" sobrevivia de
 * casualidad: de sus tres identificadores, uno seguia vivo.
 *
 * Y el problema se repite: cada vez que cambia la taxonomia, los
 * identificadores guardados quedan viejos. Con las ocho categorias previstas
 * vuelven a romperse todas.
 *
 * COMO SE DECIDE AHORA. Una comunidad es un PUEBLO o un TERRITORIO, y eso se
 * reconoce por como se lo nombra, no por el cajon tematico donde cayo la nota:
 *
 *   1. Si la comunidad tiene palabras clave, MANDAN ellas. Una nota que dice
 *      "mapuche" pertenece al Pueblo Mapuche este en derechos, en cultura o en
 *      economia. Asi la comunidad deja de depender de la taxonomia.
 *   2. Si no tiene palabras clave —las secciones tipo CAUSA, que son temas
 *      disfrazados de comunidad— se cae a los temas, descartando los que ya no
 *      existen.
 *   3. Si no queda ninguna via, no se inventa: devuelve una condicion que no
 *      encaja con nada, y la comunidad se muestra vacia de forma explicita.
 *
 * Movida aqui desde routes/public/communities.ts el 4-oct-2026, que la
 * reexporta: quien la importaba de la ruta sigue funcionando.
 */
export function buildCommunityCondition(
  keywords: string[],
  issueIds: string[],
  temasVivos: Set<string>,
): { where: Record<string, unknown>; via: 'keywords' | 'temas' | 'ninguna' } {
  if (keywords.length > 0) {
    return {
      via: 'keywords',
      where: {
        OR: keywords.flatMap((kw: string) => [
          { title: { contains: kw, mode: 'insensitive' as const } },
          { summary: { contains: kw, mode: 'insensitive' as const } },
          { sourceTitle: { contains: kw, mode: 'insensitive' as const } },
        ]),
      },
    }
  }

  const vivos = issueIds.filter(id => temasVivos.has(id))
  if (vivos.length > 0) return { via: 'temas', where: { issueId: { in: vivos } } }

  return { via: 'ninguna', where: { id: { in: [] } } }
}

/** Identificadores de tema que existen hoy. Se consulta por corrida, no por historia. */
export async function temasVivos(): Promise<Set<string>> {
  const issues = await prisma.issue.findMany({ select: { id: true } })
  return new Set(issues.map(i => i.id))
}

// --- Retencion por vertical (D4) ---

/** El interruptor de una vertical. Sin fila en community_review_modes, 'off'. */
export type ReviewMode = 'off' | 'shadow' | 'enforce'

/** Estado de una nota en una vertical. auto/pending los escribe la maquina; released/held, una persona. */
export type ReviewState = 'auto' | 'pending' | 'released' | 'held'

export const REVIEW_MODES: readonly ReviewMode[] = ['off', 'shadow', 'enforce']
export const MACHINE_STATES: readonly ReviewState[] = ['auto', 'pending']
export const HUMAN_STATES: readonly ReviewState[] = ['released', 'held']
/** Lo que se ve en una vertical en modo enforce. */
export const VISIBLE_WHEN_ENFORCED: readonly ReviewState[] = ['auto', 'released']

export function isReviewMode(x: unknown): x is ReviewMode {
  return typeof x === 'string' && (REVIEW_MODES as readonly string[]).includes(x)
}

/**
 * El modo que de verdad rige. 'enforce' con el modo aprendizaje encendido se
 * degrada a 'shadow': con el aprendizaje, el gate retiene el 100 % y aplicar
 * vaciaria la vertical (387 notas de Voces Mapuche a cero). Es un candado en el
 * codigo, no un aviso en una pantalla.
 */
export function effectiveMode(mode: ReviewMode, learningMode: boolean): ReviewMode {
  if (mode === 'enforce' && learningMode) return 'shadow'
  return mode
}

/**
 * El modo configurado de una vertical. NUNCA lanza: ante cualquier error —la
 * tabla todavia no existe porque el codigo se desplego antes del SQL, la base
 * respondio raro— devuelve 'off', que es exactamente el comportamiento de hoy.
 * Asi un SQL olvidado nunca responde 500 ni vacia una vertical.
 */
export async function getReviewMode(communityId: string): Promise<ReviewMode> {
  try {
    const rows = await prisma.$queryRaw<Array<{ mode: string }>>`
      SELECT mode FROM community_review_modes WHERE community_id = ${communityId} LIMIT 1
    `
    const mode = Array.isArray(rows) ? rows[0]?.mode : undefined
    return isReviewMode(mode) ? mode : 'off'
  } catch (err) {
    log.debug({ err, communityId }, 'review mode unavailable, treating as off')
    return 'off'
  }
}

export interface CommunityForVisibility {
  id: string
  keywords: string[]
  issueIds: string[]
}

/**
 * La exclusion que agrega el modo efectivo, o null si no agrega nada.
 *   off      nada
 *   shadow   fuera lo que una persona retuvo (held); lo demas, como hoy
 *   enforce  solo lo que tiene fila auto o released; sin fila, invisible
 */
export function reviewExclusion(communityId: string, mode: ReviewMode): Prisma.StoryWhereInput | null {
  if (mode === 'shadow') {
    return { NOT: { communityReviews: { some: { communityId, reviewState: 'held' } } } }
  }
  if (mode === 'enforce') {
    return { communityReviews: { some: { communityId, reviewState: { in: [...VISIBLE_WHEN_ENFORCED] } } } }
  }
  return null
}

/**
 * El `where` COMPLETO de lo que muestra una vertical: publicada, relevancia 3 o
 * mas, pertenencia por palabras clave y la exclusion del modo. Los tres datos
 * son obligatorios a proposito: el fork tenia un `publishedStoryWhere(property?)`
 * que devolvia `{}` cuando nadie pasaba la marca, y asi una ruta olvidada servia
 * todo sin error.
 *
 * Con `off` devuelve exactamente la forma de siempre. Con exclusion, la combina
 * con AND y no con spread: la condicion puede traer `id: { in: [] }` y una
 * exclusion por id la pisaria.
 */
export function publicCommunityWhere(args: {
  community: CommunityForVisibility
  temas: Set<string>
  mode: ReviewMode
  learningMode: boolean
}): Prisma.StoryWhereInput {
  const { community, temas, mode, learningMode } = args
  const cond = buildCommunityCondition(community.keywords, community.issueIds, temas).where as Prisma.StoryWhereInput
  const base: Prisma.StoryWhereInput = { status: 'published', relevance: { gte: 3 } }
  const exclusion = reviewExclusion(community.id, effectiveMode(mode, learningMode))
  if (!exclusion) return { ...base, ...cond }
  return { ...base, AND: [cond, exclusion] }
}
