import { z } from 'zod'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createLogger } from '../lib/logger.js'
import { getSmallLLM, rateLimitDelay } from './llm.js'
import prisma from '../lib/prisma.js'
import { truncateQuote } from '../lib/truncateQuote.js'
import { fixCapitalizationOrNull, fixTitleCapitalizationOrNull } from '../lib/title-capitalization.js'

const log = createLogger('translation')

// Los campos de salida se llaman DISTINTO que los de entrada, a proposito.
//
// Del 10-may al 12-oct-2026 el esquema pedia `title`, `summary`... —los mismos
// nombres que traia el prompt— y, con `functionCalling` (forzado en a1a2a73
// por compatibilidad con Azure), gpt-4o-mini rellenaba la funcion copiando los
// valores en español sin traducir. Resultado medido en la API publica el
// 12-oct: 3131 de 3958 noticias publicadas con el "ingles" identico al
// castellano. Reproducido en vivo: 3/3 copias con los nombres iguales, 0/3 con
// estos nombres mas el mensaje de sistema. No volver a llamarlos como la entrada.
export const translationSchema = z.object({
  titleLabelEn: z.string().describe('English translation of titleLabel'),
  titleEn: z.string().describe('English translation of title'),
  summaryEn: z.string().describe('English translation of summary'),
  quoteEn: z.string().describe('English translation of quote'),
  marketingBlurbEn: z.string().describe('English translation of marketingBlurb'),
  relevanceSummaryEn: z.string().describe('English translation of relevanceSummary'),
})

// Sin bloque <ROLE>: en este pipeline dispara el filtro de contenido de Azure
// (ver memoria "superficies ocultas del prompt"). Un rol corto por mensaje de
// sistema basta y esta probado.
const SYSTEM_PROMPT =
  'You are a professional Spanish-to-English translator. Every output field must be written in English.'

interface StoryToTranslate {
  titleLabel: string | null
  title: string | null
  summary: string | null
  quote: string | null
  marketingBlurb: string | null
  relevanceSummary: string | null
}

function buildTranslationPrompt(story: StoryToTranslate): string {
  return `Translate the following news story fields from Spanish to English. Preserve the tone, style, and meaning exactly. Keep proper nouns (people names, place names, organization names) unchanged. Return structured JSON.

Fields to translate:
- titleLabel: "${story.titleLabel || ''}"
- title: "${story.title || ''}"
- summary: "${story.summary || ''}"
- quote: "${story.quote || ''}"
- marketingBlurb: "${story.marketingBlurb || ''}"
- relevanceSummary: "${story.relevanceSummary || ''}"`
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Una "traduccion" identica al original no es una traduccion: es el modelo
 * devolviendo lo que recibio. Compara sin distinguir mayusculas ni espacios,
 * porque el guardarrail de capitalizacion toca el titulo despues.
 */
export function isUntranslated(original: string | null | undefined, translated: string | null | undefined): boolean {
  const o = normalize(original)
  const t = normalize(translated)
  return o.length > 0 && t.length > 0 && o === t
}

export class TranslationUnchangedError extends Error {
  constructor(public readonly storyId: string, public readonly fields: string[]) {
    super(`translation came back identical to the Spanish original (${fields.join(', ')})`)
    this.name = 'TranslationUnchangedError'
  }
}

export async function translateStory(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      titleLabel: true,
      title: true,
      summary: true,
      quote: true,
      marketingBlurb: true,
      relevanceSummary: true,
    },
  })

  if (!story) throw new Error('Story not found')
  if (!story.title && !story.summary) {
    log.warn({ storyId }, 'story has no content to translate, skipping')
    return
  }

  const prompt = buildTranslationPrompt(story)
  const llm = getSmallLLM()
  const structuredLlm = llm.withStructuredOutput(translationSchema, { method: 'functionCalling' })

  await rateLimitDelay()
  log.info({ storyId }, 'translating story to English')

  const result = await structuredLlm.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(prompt)])

  // Guardarrail determinista en el punto de escritura: una instruccion al LLM
  // es blanda, y el test unitario simula el modelo, asi que ninguno de los dos
  // puede atrapar esto.
  //
  // Decide el RESUMEN. Dos o tres oraciones nunca son legitimamente identicas
  // en los dos idiomas: si vuelven iguales es el modelo copiando, venga o no
  // traducido el titulo. El titulo solo NO rechaza: uno hecho de nombres
  // propios («Tapati Rapa Nui 2026») es identico de verdad, y hasta el
  // 20-oct-2026 hundia la nota entera, resumen incluido. El rotulo queda fuera
  // por la misma razon («COP30»). Una noticia sin resumen no tiene con que
  // discriminar y pasa. Falla cerrado: no se escribe nada y la noticia sigue
  // cayendo al español, que es lo mismo que pasaba.
  const copied = (['title', 'summary'] as const).filter(f => isUntranslated(story[f], result[`${f}En`]))
  if (copied.includes('summary')) {
    throw new TranslationUnchangedError(storyId, copied)
  }

  await prisma.story.update({
    where: { id: storyId },
    data: {
      // Mismo guardarrail que la version en espanol: el traductor es otro LLM
      // y comete el mismo error con siglas y toponimos. La lista blanca no
      // depende del idioma — "CONADI" y "Mozambique" se escriben igual en los
      // dos, y para los que cambian de grafia la lista ya trae las dos formas,
      // con tilde y sin ella.
      titleEn: fixTitleCapitalizationOrNull(result.titleEn),
      titleLabelEn: fixCapitalizationOrNull(result.titleLabelEn),
      summaryEn: result.summaryEn || null,
      quoteEn: truncateQuote(result.quoteEn),
      marketingBlurbEn: result.marketingBlurbEn || null,
      relevanceSummaryEn: result.relevanceSummaryEn || null,
    },
  })

  log.info({ storyId }, 'translation complete')
}

export async function translateStoriesBatch(storyIds: string[]): Promise<{ translated: number; failed: number }> {
  let translated = 0
  let failed = 0

  for (const storyId of storyIds) {
    try {
      await translateStory(storyId)
      translated++
    } catch (err) {
      log.error({ err, storyId }, 'failed to translate story')
      failed++
    }
  }

  return { translated, failed }
}
