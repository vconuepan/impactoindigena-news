import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/prisma.js', () => ({ default: { issue: { findMany: vi.fn() }, story: {}, $queryRaw: vi.fn() } }))
vi.mock('express-rate-limit', () => ({ default: () => (_r: any, _s: any, n: any) => n() }))

const { buildCommunityCondition } = await import('./communities.js')

const VIVOS = new Set(['issue-ddhh-002', 'issue-clima-001'])

/**
 * Como se decide que historias pertenecen a una comunidad.
 *
 * El seed cargo identificadores de tema que despues dejaron de existir, y la
 * condicion los exigia: once de dieciseis comunidades apuntaban a algun tema
 * fantasma y dos mostraban cero historias. Estos casos fijan la regla nueva.
 */
describe('buildCommunityCondition', () => {
  it('cuando hay palabras clave, mandan ellas y el tema no se exige', () => {
    const r = buildCommunityCondition(['mapuche', 'wallmapu'], ['issue-fantasma'], VIVOS)
    expect(r.via).toBe('keywords')
    const texto = JSON.stringify(r.where)
    expect(texto).toContain('mapuche')
    // Sin filtro por tema: una nota mapuche pertenece al pueblo este en
    // derechos, en cultura o en economia.
    expect(texto).not.toContain('issueId')
  })

  it('un tema fantasma no vacia una comunidad que tiene palabras', () => {
    // El caso "Pueblo Mapuche": dos de sus tres identificadores no existen.
    const r = buildCommunityCondition(['mapuche'], ['issue-chile-005', 'issue-paz-004'], VIVOS)
    expect(r.via).toBe('keywords')
    expect(r.where).not.toEqual({ id: { in: [] } })
  })

  it('sin palabras clave, cae a los temas y descarta los que no existen', () => {
    const r = buildCommunityCondition([], ['issue-ddhh-002', 'issue-paz-004'], VIVOS)
    expect(r.via).toBe('temas')
    expect(r.where).toEqual({ issueId: { in: ['issue-ddhh-002'] } })
  })

  it('sin palabras y con todos los temas fantasma, se declara vacia', () => {
    // El caso "Pueblos Indigenas de Chile" antes del arreglo: no inventa una
    // condicion ancha que traiga historias ajenas.
    const r = buildCommunityCondition([], ['issue-chile-005'], VIVOS)
    expect(r.via).toBe('ninguna')
    expect(r.where).toEqual({ id: { in: [] } })
  })

  it('sin palabras y sin temas, tambien vacia', () => {
    expect(buildCommunityCondition([], [], VIVOS).via).toBe('ninguna')
  })

  it('busca cada palabra en titulo, resumen y titular de la fuente', () => {
    const r = buildCommunityCondition(['aymara'], [], VIVOS)
    const campos = JSON.stringify(r.where)
    for (const campo of ['title', 'summary', 'sourceTitle']) expect(campos).toContain(campo)
  })
})
