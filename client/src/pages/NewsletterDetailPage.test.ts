import { describe, it, expect } from 'vitest'
import { descripcionDe, tituloDePestana } from './NewsletterDetailPage'

// Medido el 2-nov-2026: con la fecha nula, la descripción de /archivo/:id quedaba en «del .».
describe('descripcionDe (meta description de /archivo/:id)', () => {
  it('con fecha, la nombra', () => {
    const d = descripcionDe({ sentAt: '2026-11-02T12:00:00.000Z', storyCount: 7 })
    expect(d).toMatch(/^Boletín de Voces Indígenas del .+2026\. 7 noticias/)
  })

  it('sin fecha, no deja «del .»', () => {
    const d = descripcionDe({ sentAt: null, storyCount: 7 })
    expect(d).toBe('Boletín de Voces Indígenas. 7 noticias sobre pueblos indígenas.')
    expect(d).not.toContain('del .')
  })
})

// Medido el 7-nov-2026: 18 de 52 ediciones salían «Voces Indígenas — … — Voces Indígenas».
describe('tituloDePestana (title de /archivo/:id)', () => {
  it('no repite la marca cuando la edición ya la trae', () => {
    expect(tituloDePestana('Voces Indígenas — lunes, 2 de noviembre de 2026')).toBe('Voces Indígenas — lunes, 2 de noviembre de 2026')
  })

  it('a una edición con la marca vieja le agrega la del sitio', () => {
    expect(tituloDePestana('Impacto Indígena — Semana 16')).toBe('Impacto Indígena — Semana 16 — Voces Indígenas')
  })
})
