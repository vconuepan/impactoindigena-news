import { describe, it, expect } from 'vitest'
import { buildInstagramCaptionPrompt } from './instagram.js'

// Desde el 25-oct-2026 el pie de Instagram se escribe desde el artículo
// original, como el carrusel que acompaña. Antes recibía el resumen, las
// razones y el blurb de la IA de Voces.
const prompt = buildInstagramCaptionPrompt({
  sourceTitle: 'Lof Juan Currin enfrenta una nueva orden de desalojo',
  sourceContent: 'El Lof Juan Currin, de Temuco, fue notificado <script>de una orden</script> de desalojo.',
  publisher: 'Radio Kurruf',
  issueName: 'Territorio',
  sourceCountry: 'https://radiokurruf.org/chile',
})

describe('el pie de Instagram', () => {
  it('lleva el artículo original y el medio que reporteó', () => {
    expect(prompt).toContain('Lof Juan Currin enfrenta una nueva orden de desalojo')
    expect(prompt).toContain('fue notificado')
    expect(prompt).toContain('reporteó Radio Kurruf')
  })

  it('no lleva los campos que escribe la IA de Voces', () => {
    expect(prompt).not.toMatch(/Resumen:|Por qué importa:|Factores clave:|Blurb:/)
  })

  it('trata el artículo como dato, no como instrucciones', () => {
    expect(prompt).toContain('<UNTRUSTED_ARTICLE>')
    expect(prompt).not.toContain('<script>')
  })

  it('pide no atribuir identidad ni pueblo que el artículo no nombra', () => {
    expect(prompt).toContain('La identidad indígena no se atribuye desde afuera')
    expect(prompt).toMatch(/hashtag de un pueblo .* va solo si el artículo nombra a ese pueblo/)
  })
})
