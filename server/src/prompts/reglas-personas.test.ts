import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { REGLA_PERTENENCIA, REGLA_MENORES_VICTIMAS } from './shared.js'
import { assessResultSchema, extractTitleLabelSchema, extractQuoteAttributionSchema } from '../schemas/llm.js'
import { buildAssessPrompt } from './assess.js'

// Salvaguardas 2 y 3 de la EILE v1.2 (§7), adoptadas como regla editorial por
// el director el 6-nov-2026. Hasta ese día el título y Facebook decían «no
// atribuyas pertenencia étnica que la fuente no afirme»: si la fuente la
// afirmaba, se atribuía. Ver .plans/2026-11-06_origen-etnico-menores-victimas.md.

const fuente = (relativa: string) => readFileSync(path.resolve(__dirname, relativa), 'utf8')

describe('las dos reglas sobre personas están en todo lo que escribe el modelo', () => {
  it('en el esquema del análisis: título, resumen y atribución de la cita', () => {
    const forma = assessResultSchema.shape
    for (const campo of ['relevanceTitle', 'summary'] as const) {
      expect(forma[campo].description).toContain(REGLA_PERTENENCIA)
      expect(forma[campo].description).toContain(REGLA_MENORES_VICTIMAS)
    }
    expect(forma.quoteAttribution.description).toContain(REGLA_PERTENENCIA)
    expect(extractTitleLabelSchema.shape.title.description).toContain(REGLA_PERTENENCIA)
    expect(extractQuoteAttributionSchema.shape.quoteAttribution.description).toContain(REGLA_PERTENENCIA)
  })

  it('en el prompt del análisis', () => {
    const prompt = buildAssessPrompt('Título', 'Contenido', 'Medio', 'https://medio.cl/nota', { factors: '', antifactors: '', ratings: '' } as never)
    expect(prompt).toContain(REGLA_PERTENENCIA)
    expect(prompt).toContain(REGLA_MENORES_VICTIMAS)
  })

  it.each([
    ['facebook', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['linkedin', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['instagram', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['story-carousel', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['story-body', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['newsletter-intro', ['REGLA_PERTENENCIA', 'REGLA_MENORES_VICTIMAS']],
    ['bluesky', ['PERSON_MEMBERSHIP_RULE', 'MINORS_VICTIMS_RULE']],
    ['mastodon', ['PERSON_MEMBERSHIP_RULE', 'MINORS_VICTIMS_RULE']],
    ['podcast', ['PERSON_MEMBERSHIP_RULE', 'MINORS_VICTIMS_RULE']],
  ])('en el prompt de %s', (nombre, reglas) => {
    const codigo = fuente(`./${nombre}.ts`)
    for (const regla of reglas) expect(codigo).toContain(`\${${regla}}`)
  })

  it('ningún prompt ni esquema conserva la regla contraria', () => {
    const archivos = [
      ...readdirSync(path.resolve(__dirname)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => `./${f}`),
      '../schemas/llm.ts',
    ]
    for (const archivo of archivos) {
      const codigo = fuente(archivo)
      expect(codigo, archivo).not.toMatch(/pertenencia étnica que la (fuente|noticia) no afirme/)
    }
  })
})

describe('cada punto de escritura pasa por el candado de personas', () => {
  // La regla en el prompt es blanda; el candado (lib/personasSensibles.ts) la
  // hace cumplir donde se guarda el texto. Si alguien vuelve a guardar la
  // salida cruda del modelo, este test lo nota.
  it.each([
    ['analysis', /limpiarCampos\(analysisDataSinCandado/],
    ['translation', /limpiarCampos\(/],
    ['storyBody', /limpiarCampos\(limpiarCuerpo\(/],
    ['storyCarousel', /\.map\(sinEtiquetasSobrePersonas\)/],
    ['facebook', /limpiarPost\(result\.postText\)/],
    ['linkedin', /limpiarPost\(result\.postText\)/],
    ['bluesky', /limpiarPost\(result\.postText\.trim\(\)\)/],
    ['mastodon', /limpiarPost\(result\.postText\.trim\(\)\)/],
    ['instagram', /limpiarPost\(captionResult\.caption\)/],
  ])('%s', (servicio, patron) => {
    expect(fuente(`../services/${servicio}.ts`)).toMatch(patron)
  })
})
