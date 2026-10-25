/**
 * Mide la nota con claves sobre noticias reales ANTES de tocar el pipeline.
 *
 * Plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`, ítem A1.
 * Igual que el carrusel el 23-oct-2026: se arma el prompt, se pasa por los
 * candados, se mide costo y se leen las notas. Lo que esto diga decide la
 * forma del prompt y si la etapa va aparte o dentro de assess.
 *
 * NO TOCA LA BASE. Las noticias se leen de la API pública por su slug y el
 * artículo original se vuelve a extraer con el extractor del rastreador, que
 * es la misma materia prima que `sourceContent`. Solo llama al modelo.
 *
 *   npx tsx src/scripts/medir-nota-claves.ts <slug> [<slug> ...] --out <ruta.md>
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { extractContent } from '../services/extractor.js'
import { getLLMByTier, rateLimitDelay } from '../services/llm.js'
import { withRetry } from '../lib/retry.js'
import { publisherFromUrl } from '../lib/publisher.js'
import { buildStoryBodyPrompt } from '../prompts/story-body.js'
import { storyBodySchema, type StoryBodyResult } from '../schemas/llm.js'
import { CAMPOS, avisosBloqueantes, limpiarCuerpo, palabras, revisarCuerpo, type BodyAviso } from '../lib/storyBodyGuards.js'

const API = process.env.VOCES_API ?? 'https://vocesindigenas.org/api'
const MAX_CHARS = parseInt(process.env.STORY_BODY_MAX_SOURCE_CHARS || '15000', 10)

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? args[outIdx + 1] : null
// --solo-original: extrae y guarda los originales sin llamar al modelo, para
// contrastar las notas contra la fuente antes de la siguiente ronda.
const SOLO_ORIGINAL = args.includes('--solo-original')
// --tier large: el mismo prompt con el modelo grande, para comparar fidelidad y costo.
const tierIdx = args.indexOf('--tier')
const TIER = (tierIdx >= 0 ? args[tierIdx + 1] : 'medium') as 'small' | 'medium' | 'large'
// Precio global de Azure por millón de tokens (API de precios, 23-oct-2026 para
// gpt-4.1-mini; gpt-4o es el despliegue `large` de este repo).
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'gpt-4.1-mini': { entrada: 0.4, salida: 1.6 },
  'gpt-4o': { entrada: 2.5, salida: 10 },
}
const slugs = args.filter((a, i) => !['--out', '--solo-original', '--tier'].includes(a) && i !== outIdx + 1 && i !== tierIdx + 1)
if (slugs.length === 0 || !out) {
  console.error('uso: medir-nota-claves.ts <slug> [<slug>...] --out <ruta.md>')
  process.exit(1)
}

interface StoryApi {
  slug: string
  title: string
  summary: string
  sourceUrl: string
  sourceTitle: string
  sourceAuthor: string | null
  datePublished: string
  feed: { title: string; displayTitle?: string | null }
  issue: { name: string } | null
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago',
})

async function medir(slug: string): Promise<string> {
  const res = await fetch(`${API}/stories/${slug}`, { headers: { 'user-agent': 'voces-medicion/1.0' } })
  if (!res.ok) return `## ${slug}\n\nLa API respondió ${res.status}.\n`
  const story = (await res.json()) as StoryApi
  const publisher = publisherFromUrl(story.sourceUrl, story.feed.displayTitle || story.feed.title)

  const extraido = await extractContent(story.sourceUrl)
  if (!extraido || !extraido.content.trim()) return `## ${slug}\n\nNo se pudo extraer el original de ${story.sourceUrl}.\n`
  const original = extraido.content.trim()
  // El original queda al lado del informe: la nota se contrasta contra él.
  mkdirSync(`${out}.originales`, { recursive: true })
  writeFileSync(`${out}.originales/${slug}.txt`, `${extraido.title ?? story.sourceTitle}\n${story.sourceUrl}\n\n${original}`, 'utf8')
  if (SOLO_ORIGINAL) return `## ${slug}\n\noriginal guardado: ${original.length} caracteres (${extraido.method})\n`
  // Como en el pipeline: la fecha del original si la hay, si no la de Voces
  // (publicada a lo más 14 días después del rastreo). Nunca sin fecha.
  const fechaRef = new Date(extraido.datePublished ?? story.datePublished)
  const fechaOriginal = FORMATO_FECHA.format(fechaRef) + (extraido.datePublished ? '' : ' (fecha de publicación en Voces)')
  const anioReferencia = fechaRef.getFullYear()

  const prompt = buildStoryBodyPrompt({
    sourceTitle: extraido.title ?? story.sourceTitle,
    sourceContent: original.slice(0, MAX_CHARS),
    publisher,
    sourceDate: fechaOriginal,
  })

  const llm = getLLMByTier(TIER).withStructuredOutput(storyBodySchema, { method: 'functionCalling', includeRaw: true })
  await rateLimitDelay()
  const t0 = Date.now()
  const { raw, parsed } = await withRetry(() => llm.invoke([new HumanMessage(prompt)]))
  const ms = Date.now() - t0
  const uso = (raw as any)?.usage_metadata ?? {}
  const entrada = uso.input_tokens ?? 0
  const salida = uso.output_tokens ?? 0
  const despliegue = config.llm.provider === 'azure' ? config.llm.azure.deployments[TIER] : TIER
  const precio = PRECIOS[despliegue] ?? { entrada: 0, salida: 0 }
  const costo = (entrada * precio.entrada + salida * precio.salida) / 1_000_000

  const cuerpo = limpiarCuerpo(parsed as StoryBodyResult, original)
  const avisos = revisarCuerpo(cuerpo, original, anioReferencia)
  const bloqueantes = avisosBloqueantes(avisos)
  const totalPalabras = CAMPOS.reduce((n, c) => n + palabras(cuerpo[c] ?? '').length, 0)

  const lineas: string[] = []
  lineas.push(`## ${story.title}`)
  lineas.push('')
  lineas.push(`- slug: \`${slug}\``)
  lineas.push(`- medio: ${publisher} · autor: ${story.sourceAuthor ?? extraido.author ?? 'null'} · método de extracción: ${extraido.method}`)
  lineas.push(`- original: ${original.length.toLocaleString('es-CL')} caracteres (se mandaron ${Math.min(original.length, MAX_CHARS).toLocaleString('es-CL')}) · fecha del original: ${fechaOriginal ?? 'desconocida'}`)
  lineas.push(`- tokens: ${entrada.toLocaleString('es-CL')} de entrada + ${salida.toLocaleString('es-CL')} de salida · US$${costo.toFixed(4)} · ${(ms / 1000).toFixed(1)} s`)
  lineas.push(`- palabras: ${CAMPOS.map((c) => `${c} ${palabras(cuerpo[c] ?? '').length}`).join(' · ')} · total ${totalPalabras}`)
  lineas.push(`- avisos: ${avisos.length} (${bloqueantes.length} bloqueantes)`)
  for (const a of avisos as BodyAviso[]) lineas.push(`  - [${a.tipo}] ${a.campo}: ${a.mensaje}`)
  lineas.push('')
  lineas.push(`**Resumen de hoy (${palabras(story.summary).length} palabras):** ${story.summary}`)
  lineas.push('')
  for (const c of CAMPOS) {
    lineas.push(`**${c}**`)
    lineas.push('')
    lineas.push(cuerpo[c]?.trim() ? cuerpo[c] : '_(vacío)_')
    lineas.push('')
  }
  return lineas.join('\n')
}

async function main(): Promise<void> {
  const cabecera = [
    '# Medición de la nota con claves',
    '',
    `Fecha: ${new Date().toISOString()} · proveedor: ${config.llm.provider} · tier ${TIER}: ${config.llm.provider === 'azure' ? config.llm.azure.deployments[TIER] : 'ver config'} · tope de original: ${MAX_CHARS} caracteres`,
    '',
    'Cada nota se armó desde el artículo original re-extraído con el extractor del rastreador, con el prompt `prompts/story-body.ts` y los candados de `lib/storyBodyGuards.ts`. Nada se escribió en la base.',
    '',
  ]
  const secciones: string[] = []
  for (const slug of slugs) {
    try {
      secciones.push(await medir(slug))
    } catch (err) {
      secciones.push(`## ${slug}\n\nFalló: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }
  writeFileSync(out!, [...cabecera, ...secciones].join('\n'), 'utf8')
  console.log(`escrito ${out}`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
