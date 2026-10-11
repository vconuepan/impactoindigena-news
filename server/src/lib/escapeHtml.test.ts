import { describe, it, expect } from 'vitest'
import { escapeHtml } from './escapeHtml.js'

describe('escapeHtml', () => {
  it('codifica los cinco caracteres que abren marcado o atributos', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
  })

  it('codifica el ampersand primero: no deja entidades a medias ni dobles', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('deja intacto el texto normal, con tildes y la eñe', () => {
    expect(escapeHtml('Consulta indígena: Araucanía, año 2026')).toBe('Consulta indígena: Araucanía, año 2026')
  })

  it('null, undefined y numeros no rompen', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(0)).toBe('0')
  })
})
