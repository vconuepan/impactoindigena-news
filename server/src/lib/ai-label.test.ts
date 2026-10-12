import { describe, it, expect } from 'vitest'
import { AI_LABEL, withAiLabel } from './ai-label.js'

describe('withAiLabel', () => {
  it('agrega la línea al final, separada por una línea en blanco', () => {
    expect(withAiLabel('Texto del post.')).toBe(`Texto del post.\n\n${AI_LABEL}`)
  })

  it('no la duplica si el borrador ya la trae', () => {
    expect(withAiLabel(`Texto del post.\n\n${AI_LABEL}\n`)).toBe(`Texto del post.\n\n${AI_LABEL}`)
  })

  it('con tope de caracteres, recorta el cuerpo y la línea queda entera', () => {
    const largo = 'a'.repeat(2200)
    const publicado = withAiLabel(largo, 2200)
    expect(publicado.length).toBeLessThanOrEqual(2200)
    expect(publicado.endsWith(AI_LABEL)).toBe(true)
    expect(publicado).toContain('…')
  })

  it('si cabe, no recorta nada', () => {
    const corto = 'Texto corto.'
    expect(withAiLabel(corto, 2200)).toBe(`${corto}\n\n${AI_LABEL}`)
  })
})
