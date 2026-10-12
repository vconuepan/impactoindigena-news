import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildFacebookPostPrompt } from './facebook.js'
import { VOZ_VENANCIO_EVITAR } from './voz-venancio.js'

const STORY = {
  title: 'Comunidad recupera tierras ancestrales',
  titleLabel: 'Territorio',
  summary: 'Resumen de la noticia.',
  relevanceSummary: null,
  relevanceReasons: null,
  marketingBlurb: null,
  issueName: null,
  sourceCountry: null,
}

describe('ningún prompt de redes ordena ocultar la IA', () => {
  // Hasta el 12-oct-2026, Facebook decía «Nunca mencionar que fue generado por
  // IA» y la voz de Instagram y LinkedIn «NUNCA menciones que el texto fue
  // generado con inteligencia artificial», mientras el sitio etiqueta sus
  // resúmenes como generados por IA. La declaración la pone ahora el código.
  it('Facebook', () => {
    expect(buildFacebookPostPrompt(STORY)).not.toMatch(/Nunca mencionar que fue generado por IA/)
  })

  it('Instagram y LinkedIn (voz de Venancio)', () => {
    expect(VOZ_VENANCIO_EVITAR).not.toMatch(/menciones que el texto fue generado/)
  })
})

describe('cada red publica con la línea de IA, no con el borrador crudo', () => {
  // La regla vive en el punto de escritura: si alguien vuelve a pasar el texto
  // del borrador directo a la API, el post sale sin declarar la IA.
  const servicio = (nombre: string) =>
    readFileSync(path.resolve(__dirname, `../services/${nombre}.ts`), 'utf8')

  it('Facebook', () => {
    expect(servicio('facebook')).toMatch(/createPagePost\(withAiLabel\(post\.postText\)/)
  })

  it('Instagram', () => {
    expect(servicio('instagram')).toMatch(/runPublish\(postId, slideUrls, withAiLabel\(post\.caption, 2200\)\)/)
  })

  it('LinkedIn', () => {
    expect(servicio('linkedin')).toMatch(/createUgcPost\(\s*withAiLabel\(post\.postText, 3000\)/)
  })
})
