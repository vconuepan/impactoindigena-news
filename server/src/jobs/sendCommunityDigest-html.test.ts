import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * El digest semanal arma HTML con valores que no son nuestros: el titulo de la
 * fuente sale de la pagina de un tercero, y el titulo y el resumen los escribe
 * un modelo a partir de ella. Ninguno puede llegar al correo como marcado: sale
 * desde el remitente de la Fundacion y lo reciben personas inscritas, algunas en
 * comunidades de pueblos.
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

const ATAQUE = '<a href="https://evil.example/entra">Verifica tu cuenta</a><img src="https://evil.example/p.gif">'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.issue.findMany.mockResolvedValue([])
  mockPrisma.digestExclusion.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockResolvedValue([])
  mockPrisma.communityMember.findMany.mockResolvedValue([
    {
      consentedAt: new Date('2026-09-01'),
      user: { id: 'u1', email: 'u1@example.com', name: `Ana<script>alert(1)</script>` },
      community: { id: 'c1', slug: 'mapuche', name: `Pueblo ${ATAQUE}`, type: 'PUEBLO', issueIds: [], keywords: ['mapuche'] },
    },
  ])
  mockPrisma.story.findMany.mockResolvedValue([
    {
      title: `Mapuche ${ATAQUE}`,
      slug: 'nota-1',
      summary: `Resumen ${ATAQUE}`,
      sourceTitle: `Fuente ${ATAQUE}`,
      datePublished: new Date('2026-10-05'),
    },
  ])
})

describe('digest semanal: lo que viene de afuera no entra como marcado', () => {
  it('codifica la fuente, el titulo, el resumen, el nombre de la comunidad y el saludo', async () => {
    await runSendCommunityDigest()

    expect(sendTransactional).toHaveBeenCalledOnce()
    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).not.toContain('<a href="https://evil.example')
    expect(body).not.toContain('<img src="https://evil.example')
    expect(body).not.toContain('<script>')
    expect(body).toContain('&lt;a href=&quot;https://evil.example/entra&quot;&gt;')
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('no rompe el texto normal ni los enlaces propios', async () => {
    mockPrisma.communityMember.findMany.mockResolvedValue([
      {
        consentedAt: new Date('2026-09-01'),
        user: { id: 'u1', email: 'u1@example.com', name: 'Ana María' },
        community: { id: 'c1', slug: 'mapuche', name: 'Pueblo Mapuche', type: 'PUEBLO', issueIds: [], keywords: ['mapuche'] },
      },
    ])
    mockPrisma.story.findMany.mockResolvedValue([
      { title: 'Consulta indígena en Araucanía', slug: 'consulta-1', summary: 'Un resumen.', sourceTitle: 'Diario Austral', datePublished: new Date('2026-10-05') },
    ])
    await runSendCommunityDigest()

    const { body } = sendTransactional.mock.calls[0][0]
    expect(body).toContain('Consulta indígena en Araucanía')
    expect(body).toContain('Pueblo Mapuche')
    expect(body).toContain('Hola Ana,')
    expect(body).toContain('/stories/consulta-1')
    expect(body).toContain('/comunidad/mapuche')
  })
})
