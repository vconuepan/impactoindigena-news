import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El digest no va a quien no consintio su pertenencia a una comunidad PUEBLO.
 *
 * LO QUE ESTO CIERRA (18-oct-2026). El job leia TODAS las membresias y mandaba
 * el digest a cada una. Pertenecer a una comunidad PUEBLO revela el origen
 * etnico —dato sensible— y el POST /join exige consentimiento expreso para ello,
 * pero reconoce que hay miembros anteriores a esa compuerta que nunca
 * consintieron («backfill legacy»). A esos el digest les llegaba igual, con una
 * seccion que lleva el nombre del pueblo.
 *
 * Una comunidad TERRITORIO o CAUSA no revela origen y no exige consentimiento.
 */
const mockPrisma = vi.hoisted(() => ({
  communityMember: { findMany: vi.fn() },
  digestExclusion: { findMany: vi.fn() },
  story: { findMany: vi.fn() },
  issue: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}))
const sendTransactional = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../lib/prisma.js', () => ({ default: mockPrisma }))
vi.mock('../services/brevo.js', () => ({ sendTransactional }))

const { runSendCommunityDigest } = await import('./sendCommunityDigest.js')

const pueblo = { id: 'c-mapuche', slug: 'mapuche', name: 'Pueblo Mapuche', type: 'PUEBLO', issueIds: [], keywords: ['mapuche'] }
const causa = { id: 'c-clima', slug: 'cambio-climatico', name: 'Cambio climático', type: 'CAUSA', issueIds: [], keywords: ['clima'] }
const usuario = (n: number) => ({ id: `u${n}`, email: `u${n}@example.com`, name: `Usuaria ${n}` })

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.digestExclusion.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockResolvedValue([])
  mockPrisma.story.findMany.mockResolvedValue([
    { title: 'Una nota', slug: 'nota-1', summary: 'Resumen.', sourceTitle: 'Fuente', datePublished: new Date('2026-10-05') },
  ])
})

const destinatarios = () => sendTransactional.mock.calls.map(([o]) => o.to)

describe('digest semanal y el consentimiento de las comunidades PUEBLO', () => {
  it('un miembro PUEBLO SIN consentimiento no recibe el digest', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      { consentedAt: null, user: usuario(1), community: pueblo },
    ])
    await runSendCommunityDigest()

    expect(destinatarios(), 'el digest llego a alguien que nunca consintio su pertenencia PUEBLO').toEqual([])
  })

  it('un miembro PUEBLO CON consentimiento lo recibe', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      { consentedAt: new Date('2026-09-01'), user: usuario(1), community: pueblo },
    ])
    await runSendCommunityDigest()

    expect(destinatarios()).toEqual(['u1@example.com'])
  })

  it('una comunidad CAUSA no exige consentimiento', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      { consentedAt: null, user: usuario(1), community: causa },
    ])
    await runSendCommunityDigest()

    expect(destinatarios()).toEqual(['u1@example.com'])
  })

  it('si una persona es de una PUEBLO sin consentir y de una CAUSA, recibe solo la CAUSA', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      { consentedAt: null, user: usuario(1), community: pueblo },
      { consentedAt: null, user: usuario(1), community: causa },
    ])
    await runSendCommunityDigest()

    expect(destinatarios()).toEqual(['u1@example.com'])
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).toContain('Cambio climático')
    expect(body, 'el correo nombra una comunidad PUEBLO a la que la persona no consintio pertenecer').not.toContain('Pueblo Mapuche')
  })

  it('mezcla de personas: solo las que consintieron o no necesitaban hacerlo', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      { consentedAt: null, user: usuario(1), community: pueblo },
      { consentedAt: new Date('2026-09-01'), user: usuario(2), community: pueblo },
      { consentedAt: null, user: usuario(3), community: causa },
    ])
    await runSendCommunityDigest()

    expect(destinatarios().sort()).toEqual(['u2@example.com', 'u3@example.com'])
  })
})
