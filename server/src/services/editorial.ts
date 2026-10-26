import { HumanMessage } from '@langchain/core/messages'
import prisma from '../lib/prisma.js'
import { config } from '../config.js'
import { ContentStatus } from '@prisma/client'
import { paginate } from '../lib/paginate.js'
import { createLogger } from '../lib/logger.js'
import { getLLMByTier, rateLimitDelay } from './llm.js'
import { withRetry } from '../lib/retry.js'
import { buildEditorialPrompt } from '../prompts/index.js'
import { editorialSchema } from '../schemas/llm.js'
import { EDITORIAL_METHODS } from '../schemas/editorial.js'
import { avisosQueBloquean, revisarEditorial, type EditorialAviso } from '../lib/editorialGuards.js'

const log = createLogger('editorial')

/**
 * La editorial firmada (plan del 25-oct-2026, B5/B6).
 *
 * El flujo: el director escribe sus notas en el panel → el modelo las ordena
 * en su voz → el director edita, fija firma y método → publica. Tres reglas
 * que no se negocian y viven acá, no en el panel:
 * - sin notas suficientes no hay borrador (una editorial generada desde
 *   titulares no es una editorial firmada);
 * - sin firma ni método no se publica;
 * - las notas nunca salen por la API pública.
 */

/** Un error que el panel puede mostrar tal cual; la ruta responde 422. */
export class EditorialError extends Error {
  constructor(message: string, public avisos: EditorialAviso[] = []) {
    super(message)
    this.name = 'EditorialError'
  }
}

interface EditorialFilters {
  status?: string
  page?: number
  pageSize?: number
}

/**
 * Los campos que la API pública devuelve. `notes` queda fuera a propósito: son
 * las notas privadas del director, la materia prima y no la pieza.
 */
export const PUBLIC_EDITORIAL_FIELDS = [
  'id', 'title', 'content', 'status', 'publishedAt', 'createdAt', 'updatedAt',
  'authorName', 'method', 'sources',
] as const

export type PublicEditorial = Pick<
  { id: string; title: string; content: string; status: ContentStatus; publishedAt: Date | null; createdAt: Date; updatedAt: Date; authorName: string; method: string; sources: string },
  (typeof PUBLIC_EDITORIAL_FIELDS)[number]
>

export function toPublicEditorial(editorial: Record<string, unknown>): PublicEditorial {
  const salida: Record<string, unknown> = {}
  for (const campo of PUBLIC_EDITORIAL_FIELDS) salida[campo] = editorial[campo] ?? (campo === 'publishedAt' ? null : '')
  return salida as PublicEditorial
}

export async function getEditorials(filters: EditorialFilters) {
  const page = filters.page || 1
  const pageSize = filters.pageSize || 25
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (filters.status) where.status = filters.status as ContentStatus

  return paginate({
    findMany: () =>
      prisma.editorial.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    count: () => prisma.editorial.count({ where }),
    page,
    pageSize,
  })
}

export async function getEditorialById(id: string) {
  return prisma.editorial.findUnique({ where: { id } })
}

export async function getLatestPublishedEditorials(limit = 10) {
  return prisma.editorial.findMany({
    where: { status: ContentStatus.published },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { id: true, title: true, publishedAt: true, createdAt: true, authorName: true },
  })
}

export async function createEditorial(data: { title: string }) {
  return prisma.editorial.create({ data: { title: data.title } })
}

export async function updateEditorial(id: string, data: Record<string, unknown>) {
  return prisma.editorial.update({ where: { id }, data })
}

export async function deleteEditorial(id: string) {
  await prisma.editorial.delete({ where: { id } })
}

/**
 * Lo que impide publicar, en el orden en que el editor lo arregla. Vacío si
 * se puede publicar. Es la misma lista para el botón del panel y para la ruta.
 */
export function razonesParaNoPublicar(editorial: {
  content: string
  authorName: string
  method: string
  notes: string
}): string[] {
  const razones: string[] = []
  if (!editorial.content.trim()) razones.push('La editorial no tiene texto.')
  if (!editorial.authorName.trim()) razones.push('Falta la firma: quién escribe esta editorial.')
  if (!(EDITORIAL_METHODS as readonly string[]).includes(editorial.method)) {
    razones.push('Falta el método: si la escribió el autor o si la redactó el modelo desde sus notas y el autor la revisó.')
  }
  const bloqueantes = avisosQueBloquean(
    revisarEditorial(editorial.content, { notes: editorial.notes, authorName: editorial.authorName }),
  )
  for (const a of bloqueantes) razones.push(a.mensaje)
  return razones
}

export async function publishEditorial(id: string) {
  const editorial = await prisma.editorial.findUnique({ where: { id } })
  if (!editorial) throw new EditorialError('Editorial not found')
  const razones = razonesParaNoPublicar(editorial)
  if (razones.length > 0) {
    throw new EditorialError(`No se puede publicar: ${razones.join(' ')}`)
  }
  return prisma.editorial.update({
    where: { id },
    data: { status: ContentStatus.published, publishedAt: new Date() },
  })
}

export async function unpublishEditorial(id: string) {
  return prisma.editorial.update({
    where: { id },
    data: { status: ContentStatus.draft, publishedAt: null },
  })
}

/**
 * El borrador, desde las notas del director y nada más. Devuelve la editorial
 * guardada y los avisos de los candados sobre el texto que el modelo propuso:
 * el editor los ve en el panel y corrige; los bloqueantes vuelven a revisarse
 * al publicar.
 */
export async function generateEditorialContent(id: string) {
  const editorial = await prisma.editorial.findUnique({ where: { id } })
  if (!editorial) throw new EditorialError('Editorial not found')

  const notes = editorial.notes.trim()
  if (notes.length < config.editorial.minNotesChars) {
    throw new EditorialError(
      `Las notas tienen ${notes.length} caracteres y hacen falta al menos ${config.editorial.minNotesChars} para redactar sin inventar. Escribe primero qué quieres decir: el hecho, la lectura y la propuesta.`,
    )
  }

  const prompt = buildEditorialPrompt({
    notes,
    title: editorial.title,
    weekLabel: getWeekLabel(new Date()),
  })

  await rateLimitDelay()
  const llm = getLLMByTier(config.editorial.modelTier)
  const structuredLlm = llm.withStructuredOutput(editorialSchema, { method: 'functionCalling' })

  log.info({ editorialId: id, notesChars: notes.length }, 'generating editorial draft from notes')

  const result = await withRetry(() => structuredLlm.invoke([new HumanMessage(prompt)]))
  const content = limpiarContenido(result.content)
  const avisos = revisarEditorial(content, { notes, authorName: editorial.authorName })

  const guardada = await prisma.editorial.update({
    where: { id },
    data: {
      title: result.title?.trim() || editorial.title,
      content,
      // El borrador lo escribió el modelo desde las notas; si el autor lo
      // publica es porque lo revisó. Si lo escribió él, lo cambia a 'humana'.
      method: editorial.method || 'ia_revisada',
    },
  })
  return { ...guardada, avisos }
}

/** Texto plano, párrafos separados por una línea en blanco, sin firma pegada por el modelo. */
export function limpiarContenido(texto: string): string {
  return texto
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^[—–-]\s*Venancio\b/i.test(p))
    .join('\n\n')
}

/** Format editorial content for LinkedIn: plain text, double line breaks, hashtags. */
export function formatForLinkedIn(editorial: { title: string; content: string; authorName?: string }): string {
  const hashtags = '#PueblosIndígenas #DerechosTerritoriales #TransiciónEnergética #ImpactoIndígena #SocialLicense'

  // Content is already plain text — just ensure double newlines between paragraphs
  const body = editorial.content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n\n')

  const firma = editorial.authorName?.trim() ? `\n\n— ${editorial.authorName.trim()}` : ''
  return `${editorial.title}\n\n${body}${firma}\n\n${hashtags}`
}

export function getWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `semana ${weekNo} de ${d.getUTCFullYear()}`
}
