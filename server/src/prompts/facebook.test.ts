import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildFacebookPostPrompt, withAiLabel, FACEBOOK_AI_LABEL } from './facebook.js'

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

describe('la Página de Facebook declara el uso de IA', () => {
  it('el prompt ya no ordena ocultar la IA', () => {
    // Hasta el 12-oct-2026 decía «Nunca mencionar que fue generado por IA»,
    // mientras el sitio etiqueta sus resúmenes como generados por IA.
    const prompt = buildFacebookPostPrompt(STORY)
    expect(prompt).not.toMatch(/Nunca mencionar que fue generado por IA/)
  })

  it('cada post publicado termina con la línea fija', () => {
    const publicado = withAiLabel('Texto del post.')
    expect(publicado.endsWith(FACEBOOK_AI_LABEL)).toBe(true)
    expect(publicado).toBe(`Texto del post.\n\n${FACEBOOK_AI_LABEL}`)
  })

  it('no la duplica si el borrador ya la trae', () => {
    const conLinea = `Texto del post.\n\n${FACEBOOK_AI_LABEL}\n`
    expect(withAiLabel(conLinea)).toBe(`Texto del post.\n\n${FACEBOOK_AI_LABEL}`)
  })

  it('el servicio publica con la línea, no el borrador crudo', () => {
    // La regla vive en el punto de escritura: si alguien vuelve a pasar
    // post.postText directo a la API, el post sale sin declarar la IA.
    const servicio = readFileSync(path.resolve(__dirname, '../services/facebook.ts'), 'utf8')
    expect(servicio).toMatch(/createPagePost\(withAiLabel\(post\.postText\)/)
  })
})
