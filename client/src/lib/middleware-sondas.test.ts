import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { esSondaSinArchivo, onRequest } from '../../functions/_middleware'

// PageSpeed 27-nov-2026: en Cloudflare Pages `/.well-known/*` y `/llms.txt`
// respondían la portada con 200 y Lighthouse las leía como archivos rotos.
describe('sondas de agentes en Cloudflare Pages', () => {
  it('reconoce las rutas que sondean los agentes', () => {
    expect(esSondaSinArchivo('/.well-known/ai-catalog.json')).toBe(true)
    expect(esSondaSinArchivo('/llms.txt')).toBe(true)
    expect(esSondaSinArchivo('/robots.txt')).toBe(false)
    expect(esSondaSinArchivo('/about')).toBe(false)
  })

  const ctx = (ruta: string, respuesta: Response) => ({
    request: new Request(`https://impactoindigena.news${ruta}`),
    env: { ORIGIN: 'https://origen.example' },
    next: vi.fn(async () => respuesta),
  })

  it('cambia el respaldo HTML del SPA por un 404', async () => {
    const r = await onRequest(ctx('/.well-known/ai-catalog.json', new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })))
    expect(r.status).toBe(404)
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('deja pasar un archivo real publicado en esas rutas', async () => {
    const r = await onRequest(ctx('/llms.txt', new Response('# Impacto', { headers: { 'content-type': 'text/plain' } })))
    expect(r.status).toBe(200)
  })

  it('_routes.json manda esas rutas a la función', () => {
    const rutas = JSON.parse(readFileSync(path.resolve(__dirname, '../../public/_routes.json'), 'utf8'))
    expect(rutas.include).toEqual(expect.arrayContaining(['/.well-known/*', '/llms.txt']))
  })
})
