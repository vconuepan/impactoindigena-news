/**
 * Mide un segundo paso que contrasta la nota con claves contra el original.
 *
 * Plan `.plans/2026-10-25_contenido-propio-y-ficha-con-claves.md`, decisión C7.
 * En la quinta franja (2-nov-2026) 3 de 8 cuerpos guardados traían un error de
 * hecho que ningún candado ve: las cifras y los nombres estaban en el original
 * y lo errado era la relación entre ellos. Esto mide si un modelo que lee el
 * original y la nota lo atrapa, y cuánto ruido mete, ANTES de tocar el pipeline.
 *
 * NO TOCA LA BASE. La nota se lee de la API pública por su slug; el original se
 * vuelve a extraer con el extractor del rastreador. Solo llama al modelo.
 *
 *   npx tsx src/scripts/medir-contraste-nota-claves.ts --out <ruta.md> <slug> [<slug> ...]
 *   npx tsx src/scripts/medir-contraste-nota-claves.ts --out <ruta.md> --slugs <archivo>
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { HumanMessage } from '@langchain/core/messages'
import { config } from '../config.js'
import { extractContent } from '../services/extractor.js'
import { getLLMByTier, rateLimitDelay } from '../services/llm.js'
import { withRetry } from '../lib/retry.js'
import { sanitizeUntrustedContent, UNTRUSTED_CONTENT_GUARD } from '../prompts/shared.js'

const API = process.env.VOCES_API ?? 'https://vocesindigenas.org/api'
const MAX_CHARS = parseInt(process.env.STORY_BODY_MAX_SOURCE_CHARS || '15000', 10)
const CAMPOS = ['bajada', 'quePaso', 'porQueImporta', 'contexto', 'queSigue'] as const
// Precio global de Azure por millón de tokens, los mismos de medir-nota-claves.ts.
const PRECIOS = { medium: { entrada: 0.4, salida: 1.6 }, large: { entrada: 2.5, salida: 10 } }

const args = process.argv.slice(2)
const valor = (flag: string) => (args.indexOf(flag) >= 0 ? args[args.indexOf(flag) + 1] : null)
const out = valor('--out')
const archivoSlugs = valor('--slugs')
// --tier large: el mismo contraste con el modelo grande, para comparar.
const TIER = (valor('--tier') ?? 'medium') as 'medium' | 'large'
const PRECIO = PRECIOS[TIER]
const sueltos = args.filter((a, i) => !a.startsWith('--') && !['--out', '--slugs', '--tier'].includes(args[i - 1]))
const slugs = archivoSlugs ? readFileSync(archivoSlugs, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : sueltos
if (!out || slugs.length === 0) {
  console.error('uso: medir-contraste-nota-claves.ts --out <ruta.md> (<slug>... | --slugs <archivo>)')
  process.exit(1)
}

const contrasteSchema = z.object({
  problemas: z.array(z.object({
    campo: z.enum(CAMPOS),
    frase: z.string().describe('La frase de la nota, copiada tal cual'),
    tipo: z.enum(['contradice', 'no_lo_dice', 'relacion_cambiada', 'fecha', 'persona_o_cargo', 'valoracion_sin_atribuir'])
      .describe('contradice: el original dice lo contrario. no_lo_dice: el original no trae ese hecho. relacion_cambiada: los datos están pero unidos de otra forma (quién, de qué total, a qué se refiere). fecha: año o momento distinto del original. persona_o_cargo: nombre, género, cargo o institución distinta. valoracion_sin_atribuir: un juicio presentado como hecho que en el original es dicho de alguien'),
    evidencia: z.string().describe('Lo que dice el original, copiado letra por letra; vacío si el original no lo trae'),
    correccion: z.string().describe('La frase corregida, fiel al original, en el mismo español de la nota'),
    gravedad: z.enum(['grave', 'menor']).describe('grave: un lector queda mal informado sobre un hecho. menor: imprecisión que no cambia lo que el lector entiende'),
  })).describe('Vacío si la nota es fiel al original'),
})
type Contraste = z.infer<typeof contrasteSchema>

interface FichaApi {
  slug: string
  title: string
  sourceUrl: string
  sourceTitle: string
  datePublished: string
  feed: { title: string; displayTitle?: string | null }
  body: Record<(typeof CAMPOS)[number], string | null> | null
}

function prompt(titulo: string, original: string, nota: string): string {
  return `<GOAL>
Contrasta una nota periodística en español con el artículo original del que se redactó, y entrega cada afirmación de hecho de la nota que el original no respalda tal como está escrita. Una nota fiel entrega la lista vacía.
</GOAL>

<CRITERIOS>
- Cuenta como problema lo que un lector entendería distinto de lo que dice el original: un hecho que el original no trae, una cifra atribuida a otro total o a otro actor, un año o un momento distinto, una persona con otro cargo, otro género o en otra institución, una reunión o un acuerdo confundido con otro, un juicio presentado como hecho cuando el original lo pone en boca de alguien.
- El original puede estar en otro idioma: la traducción fiel no es un problema, y una cita traducida en estilo indirecto tampoco.
- No es problema: resumir, ordenar distinto, omitir detalles, explicar con palabras propias lo que el original dice, ni la fecha de la noticia que se indica abajo.
- En «porQueImporta» la nota explica por qué el hecho importa a los pueblos: eso es análisis propio y no se marca, salvo que afirme un hecho que el original no trae.
- La evidencia se copia del original letra por letra; si el original no trae el hecho, va vacía.
</CRITERIOS>

${UNTRUSTED_CONTENT_GUARD}

<ORIGINAL>
Título original: ${sanitizeUntrustedContent(titulo)}

${sanitizeUntrustedContent(original)}
</ORIGINAL>

<NOTA>
${sanitizeUntrustedContent(nota)}
</NOTA>`
}

interface Resultado { slug: string; titulo: string; medio: string; problemas: Contraste['problemas']; entrada: number; salida: number; error?: string }

async function contrastar(slug: string): Promise<Resultado> {
  const vacio = { slug, titulo: slug, medio: '', problemas: [], entrada: 0, salida: 0 }
  const res = await fetch(`${API}/stories/${slug}`, { headers: { 'user-agent': 'voces-medicion/1.0' } })
  if (!res.ok) return { ...vacio, error: `la API respondió ${res.status}` }
  const ficha = (await res.json()) as FichaApi
  const medio = ficha.feed.displayTitle || ficha.feed.title
  if (!ficha.body) return { ...vacio, titulo: ficha.title, medio, error: 'la ficha no tiene cuerpo' }
  const extraido = await extractContent(ficha.sourceUrl)
  if (!extraido || !extraido.content.trim()) return { ...vacio, titulo: ficha.title, medio, error: `no se pudo extraer ${ficha.sourceUrl}` }
  const nota = CAMPOS.map((c) => `[${c}]\n${ficha.body![c] ?? ''}`).join('\n\n')
  const llm = getLLMByTier(TIER).withStructuredOutput(contrasteSchema, { method: 'functionCalling', includeRaw: true })
  await rateLimitDelay()
  const { raw, parsed } = await withRetry(() =>
    llm.invoke([new HumanMessage(prompt(extraido.title ?? ficha.sourceTitle, extraido.content.trim().slice(0, MAX_CHARS), nota))]),
  )
  const uso = (raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata ?? {}
  return { slug, titulo: ficha.title, medio, problemas: (parsed as Contraste).problemas, entrada: uso.input_tokens ?? 0, salida: uso.output_tokens ?? 0 }
}

const resultados: Resultado[] = []
// Una extracción colgada dejó la primera corrida 2 h sin avanzar (3-nov-2026).
const TOPE_MS = 120_000
const conTope = (slug: string) => Promise.race([
  contrastar(slug),
  new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error(`sin respuesta en ${TOPE_MS / 1000} s`)), TOPE_MS)),
])
for (const [i, slug] of slugs.entries()) {
  try {
    resultados.push(await conTope(slug))
    console.log(`${i + 1}/${slugs.length} ${slug}`)
  } catch (err) {
    resultados.push({ slug, titulo: slug, medio: '', problemas: [], entrada: 0, salida: 0, error: err instanceof Error ? err.message : String(err) })
  }
}

const costo = resultados.reduce((n, r) => n + (r.entrada * PRECIO.entrada + r.salida * PRECIO.salida) / 1_000_000, 0)
const lineas = [
  '# Contraste de la nota con claves contra el original',
  '',
  `Fecha: ${new Date().toISOString()} · tier ${TIER}: ${config.llm.provider === 'azure' ? config.llm.azure.deployments[TIER] : TIER} · ${resultados.length} notas · US$${costo.toFixed(4)} en total`,
  '',
]
for (const r of resultados) {
  lineas.push(`## ${r.titulo}`, '', `- slug: \`${r.slug}\` · medio: ${r.medio}${r.error ? ` · **error:** ${r.error}` : ''}`, '')
  for (const p of r.problemas) {
    lineas.push(`- **${p.gravedad} · ${p.tipo} · ${p.campo}:** «${p.frase}»`, `  - original: ${p.evidencia ? `«${p.evidencia}»` : '(no lo trae)'}`, `  - corrección: ${p.correccion}`)
  }
  if (!r.error && r.problemas.length === 0) lineas.push('- sin problemas')
  lineas.push('')
}
writeFileSync(out, lineas.join('\n'), 'utf8')
writeFileSync(`${out}.json`, JSON.stringify(resultados, null, 2), 'utf8')
console.log(`escrito ${out} · US$${costo.toFixed(4)}`)
process.exit(0)
