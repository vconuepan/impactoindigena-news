import { z } from 'zod'

/**
 * Salida estructurada del juez del carril de marca (D5).
 *
 * Lección del pre-filtro (12-oct-2026): un solo valor fuera del enum en UN
 * artículo hacía que Zod rechazara el lote entero, y el 99 % de los lotes falló
 * en silencio durante meses. Aquí cada campo de vocabulario cerrado cae a null
 * con `.catch(null)`, y el carril trata null como «no admitida»: falla cerrado
 * por nota, no por lote.
 */

export const EJES_ARAUCANIA = ['mapuche_chileno', 'regionalismo_centralismo', 'pobreza_desarrollo', 'region_completa'] as const
export const EJES_MAPUCHE = [
  'lengua', 'saber', 'economia_propia', 'propuestas', 'protagonismo',
  'territorio_derechos', 'conflicto', 'vida_urbana', 'otro',
] as const
export const LUGARES_MAPUCHE = ['gulumapu', 'puelmapu', 'williche', 'urbano', 'otro'] as const
export const BANDERAS_SENSIBLES = ['menores', 'victimas', 'violencia', 'proceso_penal', 'operativo'] as const

const motivo = z
  .string()
  .describe('Motivo del juicio en 20 palabras como máximo. Describe la nota, nunca a una persona: no incluye nombres propios de personas.')

const puntaje = z.number().int().min(1).max(10).nullable().catch(null)

export const brandTerritorialItemSchema = z.object({
  articleId: z.string().describe('El Article ID tal como aparece en el bloque de artículos.'),
  isNews: z.boolean().catch(false).describe('true si es una noticia: un hecho, una decisión o una declaración con fecha. false si es un aviso, un trámite o una página institucional sin hecho.'),
  aboutRegion: z.boolean().catch(false).describe('true solo si la nota trata sobre La Araucanía según la regla de entrada de las pautas. Una mención de paso no basta.'),
  score: puntaje.describe('Nota territorial de 1 a 10 según la escala de las pautas de la marca.'),
  axis: z.enum(EJES_ARAUCANIA).nullable().catch(null).describe('El eje de la nota según las pautas: una de las tres tensiones o region_completa.'),
  sensitive: z.array(z.enum(BANDERAS_SENSIBLES)).catch([]).describe('Banderas sensibles presentes en la nota. Ante la duda, se marca.'),
  reason: motivo,
})

export const brandTerritorialResultSchema = z.object({
  articles: z.array(brandTerritorialItemSchema),
})

export const brandMapucheItemSchema = z.object({
  articleId: z.string().describe('El Article ID tal como aparece en el bloque de artículos.'),
  score: puntaje.describe('Nota de 1 a 10 en la escala de marca de las pautas.'),
  axis: z.enum(EJES_MAPUCHE).nullable().catch(null).describe('El eje temático de la nota según las pautas.'),
  place: z.enum(LUGARES_MAPUCHE).nullable().catch(null).describe('Dónde ocurre lo que cuenta la nota, según las pautas.'),
  sensitive: z.array(z.enum(BANDERAS_SENSIBLES)).catch([]).describe('Banderas sensibles presentes en la nota. Ante la duda, se marca.'),
  reason: motivo,
})

export const brandMapucheResultSchema = z.object({
  articles: z.array(brandMapucheItemSchema),
})

export type BrandTerritorialItem = z.infer<typeof brandTerritorialItemSchema>
export type BrandMapucheItem = z.infer<typeof brandMapucheItemSchema>
