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

  // Desde el 25-nov-2026 el texto pasa antes por el aviso de independencia
  // (regla 2), y la línea de IA se agrega a ese texto, siempre al final.
  it('Facebook', () => {
    const fuente = servicio('facebook')
    expect(fuente).toMatch(/const texto = conAvisoDeIndependencia\(post\.postText, /)
    expect(fuente).toMatch(/createPagePost\(withAiLabel\(texto\)/)
  })

  it('Instagram', () => {
    const fuente = servicio('instagram')
    expect(fuente).toMatch(/const caption = conAvisoDeIndependencia\(post\.caption, /)
    expect(fuente).toMatch(/runPublish\(postId, slideUrls, withAiLabel\(caption, 2200\)\)/)
  })

  it('LinkedIn', () => {
    const fuente = servicio('linkedin')
    expect(fuente).toMatch(/const texto = conAvisoDeIndependencia\(post\.postText, /)
    expect(fuente).toMatch(/createUgcPost\(\s*withAiLabel\(texto, 3000\)/)
  })
})
