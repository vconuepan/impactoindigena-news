import { describe, it, expect } from 'vitest'
import { safeInternalPath } from './safePath'

const FALLBACK = '/comunidades'

describe('safeInternalPath', () => {
  it('deja pasar una ruta interna normal', () => {
    expect(safeInternalPath('/comunidad/mapuche', FALLBACK)).toBe('/comunidad/mapuche')
  })

  it('conserva query y hash', () => {
    expect(safeInternalPath('/stories/algo?ref=mail#seccion', FALLBACK)).toBe('/stories/algo?ref=mail#seccion')
  })

  it('cae al fallback si no hay valor', () => {
    expect(safeInternalPath(undefined, FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath(null, FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('', FALLBACK)).toBe(FALLBACK)
  })

  // El vector del open redirect: el navegador lee //host como protocol-relative
  // y sale del sitio, aunque parezca una ruta.
  it('rechaza protocol-relative', () => {
    expect(safeInternalPath('//evil.example.com', FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('//evil.example.com/login', FALLBACK)).toBe(FALLBACK)
  })

  // El vector puntual de GHSA-wrjc-x8rr-h8h6: los navegadores normalizan \ a /.
  it('rechaza backslash tras la barra inicial', () => {
    expect(safeInternalPath('/\\evil.example.com', FALLBACK)).toBe(FALLBACK)
  })

  it('rechaza URLs absolutas', () => {
    expect(safeInternalPath('https://evil.example.com', FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('http://evil.example.com', FALLBACK)).toBe(FALLBACK)
  })

  it('rechaza esquemas que no son rutas', () => {
    expect(safeInternalPath('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('data:text/html,<script>alert(1)</script>', FALLBACK)).toBe(FALLBACK)
  })

  it('rechaza rutas relativas sin barra inicial', () => {
    expect(safeInternalPath('comunidades', FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('../admin', FALLBACK)).toBe(FALLBACK)
  })

  it('rechaza caracteres de control', () => {
    expect(safeInternalPath('/comunidades\r\nSet-Cookie: x=1', FALLBACK)).toBe(FALLBACK)
    expect(safeInternalPath('/comunidades\0', FALLBACK)).toBe(FALLBACK)
  })
})
