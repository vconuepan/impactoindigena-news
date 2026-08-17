import { describe, it, expect } from 'vitest'
import { normalizeAuthor, extractAuthorFromHtml } from './author.js'

describe('normalizeAuthor', () => {
  it('acepta un nombre normal', () => {
    expect(normalizeAuthor('María del Mar Parra')).toBe('María del Mar Parra')
  })

  it('rechaza URLs, que es lo que mas devuelven los sitios', () => {
    // Casos REALES medidos el 17-ago sobre los 25 dominios mas crawleados.
    expect(normalizeAuthor('https://www.infobae.com/autor/fabricio-quiros')).toBeNull()
    expect(normalizeAuthor('https://www.facebook.com/elmostrador/')).toBeNull()
  })

  it('rechaza correos', () => {
    expect(normalizeAuthor('redaccion@medio.cl')).toBeNull()
  })

  it('resuelve los escapes unicode del JSON-LD', () => {
    // telesurtv.net devuelve literalmente "Javier Dueñas".
    expect(normalizeAuthor('Javier Due\\u00f1as')).toBe('Javier Dueñas')
  })

  it('quita el prefijo de firma', () => {
    expect(normalizeAuthor('By Anita Hofschneider')).toBe('Anita Hofschneider')
    expect(normalizeAuthor('Por Patricio Melillanca')).toBe('Patricio Melillanca')
    expect(normalizeAuthor('  autor: Helen Mora ')).toBe('Helen Mora')
  })

  it('corta el nombre del medio pegado al del autor', () => {
    // rnz.co.nz devuelve "RNZ | Te Reo Irirangi o Aotearoa".
    expect(normalizeAuthor('Amit Bhelari | The Hindu')).toBe('Amit Bhelari')
    expect(normalizeAuthor('Naina Rao — Mongabay')).toBe('Naina Rao')
  })

  it('conserva el nombre de una redaccion, que tambien es autor', () => {
    // La ley pide mencionar al autor; a veces el autor es el medio.
    expect(normalizeAuthor('Alaska Native News Staff')).toBe('Alaska Native News Staff')
    expect(normalizeAuthor('South Dakota Searchlight')).toBe('South Dakota Searchlight')
  })

  it('rechaza lo vacio, lo minusculo y lo que no tiene letras', () => {
    expect(normalizeAuthor('')).toBeNull()
    expect(normalizeAuthor(null)).toBeNull()
    expect(normalizeAuthor(undefined)).toBeNull()
    expect(normalizeAuthor('a')).toBeNull()
    expect(normalizeAuthor('---')).toBeNull()
    expect(normalizeAuthor('x'.repeat(200))).toBeNull()
  })
})

describe('extractAuthorFromHtml', () => {
  it('lee el JSON-LD, que es la fuente mas fiable', () => {
    const html = `<script type="application/ld+json">{"author":{"@type":"Person","name":"Naina Rao"}}</script>`
    expect(extractAuthorFromHtml(html)).toBe('Naina Rao')
  })

  it('lee la meta author', () => {
    expect(extractAuthorFromHtml('<meta name="author" content="Erasmo Tauran">')).toBe('Erasmo Tauran')
  })

  it('lee la meta con los atributos al reves', () => {
    expect(extractAuthorFromHtml('<meta content="Helen Mora" name="author">')).toBe('Helen Mora')
  })

  it('sigue buscando cuando el primer patron devuelve una URL', () => {
    // El caso de elmostrador.cl: article:author trae un enlace a Facebook y el
    // autor real esta en otra etiqueta. Un patron con basura no descarta la nota.
    const html = `
      <meta property="article:author" content="https://www.facebook.com/elmostrador/">
      <meta name="author" content="María del Mar Parra">`
    expect(extractAuthorFromHtml(html)).toBe('María del Mar Parra')
  })

  it('devuelve null cuando la pagina no publica autor', () => {
    // 8 de los 25 dominios medidos no lo publican. null es correcto: la ley
    // obliga a mencionar al autor, no a inventarlo.
    expect(extractAuthorFromHtml('<html><body><p>Sin firma</p></body></html>')).toBeNull()
    expect(extractAuthorFromHtml(null)).toBeNull()
  })
})
